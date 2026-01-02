import express, { Router, Request, Response } from "express";
import { type SignedDeploySchema, signedDeploySchema } from "../schemas/validation.schemas";
import { DeployUtil, CLPublicKey, CasperClient } from "casper-js-sdk";
import { env } from "../env";
const NODE_URL = env.CASPER_NODE_URL;
const router = Router();

router.post('/sign-deploy', async (req: Request, res: Response) => {
    try {
        console.log('Received sign-deploy request with body size:', JSON.stringify(req.body).length);
        const parsed = signedDeploySchema.safeParse(req.body);
        if (!parsed.success) {
            console.error('Validation error:', parsed.error);
            return res.status(400).send('Invalid request body');
        }
        const {  signatureHex, publicKeyHex, deployJSON } = parsed.data;
        
        if (!deployJSON || !signatureHex || !publicKeyHex) {
            return res.status(400).send('Missing required parameters: deployJSON, signatureHex, publicKeyHex');
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

        res.send({ deployHash });


    }
    catch (error) {
        console.error('Error signing and submitting deploy:', error);
        res.status(500).send({ error: 'Internal Server Error' });
    }
});

export default router;