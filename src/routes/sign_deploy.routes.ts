import express, { Router, Request, Response } from "express";
import { type SignedDeploySchema, signedDeploySchema } from "../schemas/validation.schemas";
import { DeployUtil, CLPublicKey, CasperClient } from "casper-js-sdk";
import { env } from "../env";
import { standardRateLimiter } from "../middlewares/rate-limit.middleware";
import { deployVerificationService } from "../services/deploy-verification.service.js";
import { DepositRequest } from "../models/deposit-request.model.js";
import { UnstakeRequest } from "../models/unstake-request.model.js";
import { Treasury } from "../models/treasury.model.js";

const NODE_URL = env.CASPER_NODE_URL;
const router = Router();

router.post('/sign-deploy', standardRateLimiter, async (req: Request, res: Response) => {
    try {
        console.log('Received sign-deploy request with body size:', JSON.stringify(req.body).length);
        const parsed = signedDeploySchema.safeParse(req.body);
        if (!parsed.success) {
            console.error('Validation error:', parsed.error);
            return res.status(400).json({ 
                error: 'Invalid request body',
                details: parsed.error.issues 
            });
        }
        const { signatureHex, publicKeyHex, deployJSON } = parsed.data;
        
        if (!deployJSON || !signatureHex || !publicKeyHex) {
            return res.status(400).json({ 
                error: 'Missing required parameters: deployJSON, signatureHex, publicKeyHex' 
            });
        }

        // Parse the unsigned deploy from JSON
        const unsignedDeploy = DeployUtil.deployFromJson(deployJSON).unwrap();
        console.log('Successfully parsed unsigned deploy from JSON.');

        // Create public key object
        const publicKey = CLPublicKey.fromHex(publicKeyHex);
        console.log('Successfully created public key object from hex.');

        // Convert signatureHex to Uint8Array
        const signature = Uint8Array.from(Buffer.from(signatureHex, 'hex'));
        console.log('Successfully converted signature hex to Uint8Array.');

        // Add the signature to create the signed deploy
        const signedDeploy = DeployUtil.setSignature(unsignedDeploy, signature, publicKey);
        console.log('Successfully created signed deploy by adding the signature.');

        // Initialize client and submit the deploy
        const client = new CasperClient(NODE_URL);
        const deployHash = await client.putDeploy(signedDeploy);

        console.log(`[SignDeploy] Deploy submitted successfully: ${deployHash}`);

        // Extract entry point and args from the deploy to determine transaction type
        const deployObj = signedDeploy.toJSON();
        const session = deployObj.deploy?.session;
        let entryPoint = '';
        let amount = '0';

        // Extract entry point and amount from the deploy
        if (session?.StoredContractByHash) {
            entryPoint = session.StoredContractByHash.entry_point;
            const args = session.StoredContractByHash.args;
            // Find amount in args
            for (const arg of args) {
                if (arg[0] === 'amount') {
                    amount = arg[1].parsed || '0';
                    break;
                }
            }
        }

        console.log(`[SignDeploy] Entry point: ${entryPoint}, Amount: ${amount}`);

        // Wait 5 seconds before verification as requested
        console.log(`[SignDeploy] Waiting 5 seconds before verification...`);
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Verify the deploy on-chain
        console.log(`[SignDeploy] Starting verification for deploy: ${deployHash}`);
        const verificationResult = await deployVerificationService.verifyDeploy(deployHash);

        console.log(`[SignDeploy] Verification result:`, {
            status: verificationResult.status,
            success: verificationResult.success,
            entryPoint: verificationResult.entryPoint,
        });

        // Determine if this is a deposit or unstake based on entry point
        const isDeposit = entryPoint === 'stake' || entryPoint === 'deposit';
        const isUnstake = entryPoint === 'request_unstake' || entryPoint === 'unstake';

        // Record the transaction in the database based on verification result
        if (verificationResult.success && verificationResult.status === 'processed') {
            const userPublicKey = publicKey.toHex();

            if (isDeposit) {
                // Check if deposit already exists
                const existingDeposit = await DepositRequest.findOne({ deploy_hash: deployHash });
                
                if (!existingDeposit) {
                    // Create deposit request record
                    const depositRequest = new DepositRequest({
                        public_key: userPublicKey,
                        amount: amount,
                        deploy_hash: deployHash,
                        status: 'completed',
                        request_timestamp: new Date(),
                        processed_timestamp: new Date(),
                        verification_timestamp: new Date(),
                    });
                    await depositRequest.save();

                    // Update treasury
                    await Treasury.findOneAndUpdate(
                        { public_key: userPublicKey },
                        {
                            $inc: {
                                total_deposited: amount,
                                current_balance: amount,
                            },
                            $push: {
                                transaction_history: {
                                    type: 'Deposit',
                                    amount,
                                    deploy_hash: deployHash,
                                    timestamp: new Date(),
                                },
                            },
                            $setOnInsert: {
                                first_deposit_date: new Date(),
                            },
                            last_activity_date: new Date(),
                        },
                        { upsert: true }
                    );

                    console.log(`[SignDeploy] Deposit recorded successfully for ${userPublicKey}`);
                }
            } else if (isUnstake) {
                // Check if unstake already exists
                const existingUnstake = await UnstakeRequest.findOne({ deploy_hash: deployHash });
                
                if (!existingUnstake) {
                    // Create unstake request record
                    const unstakeRequest = new UnstakeRequest({
                        public_key: userPublicKey,
                        amount: amount,
                        deploy_hash: deployHash,
                        status: 'pending', // pending until withdrawal is processed
                        request_timestamp: new Date(),
                    });
                    await unstakeRequest.save();

                    // Update treasury to track pending unstake
                    await Treasury.findOneAndUpdate(
                        { public_key: userPublicKey },
                        {
                            $inc: { pending_unstake: amount },
                            $push: {
                                transaction_history: {
                                    type: 'Unstake',
                                    amount,
                                    deploy_hash: deployHash,
                                    timestamp: new Date(),
                                },
                            },
                            last_activity_date: new Date(),
                        },
                        { upsert: false }
                    );

                    console.log(`[SignDeploy] Unstake recorded successfully for ${userPublicKey}`);
                }
            }

            return res.json({
                success: true,
                deployHash,
                verification: {
                    status: verificationResult.status,
                    verified: true,
                    blockHeight: verificationResult.blockHeight,
                    timestamp: verificationResult.timestamp,
                    entryPoint: verificationResult.entryPoint,
                },
                transaction: {
                    type: isDeposit ? 'deposit' : isUnstake ? 'unstake' : 'unknown',
                    amount,
                    recorded: isDeposit || isUnstake,
                },
            });
        } else {
            // Deploy failed or couldn't be verified
            console.log(`[SignDeploy] Deploy verification failed: ${verificationResult.status}`);
            
            return res.status(400).json({
                success: false,
                deployHash,
                verification: {
                    status: verificationResult.status,
                    verified: false,
                    errorMessage: verificationResult.errorMessage,
                },
                error: verificationResult.errorMessage || `Deploy verification failed with status: ${verificationResult.status}`,
            });
        }
    } catch (error) {
        console.error('Error signing and submitting deploy:', error);
        return res.status(500).json({ 
            error: 'Internal Server Error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;