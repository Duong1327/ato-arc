import { initiateDeveloperControlledWalletsClient } from '@circle-fin/developer-controlled-wallets';
import * as dotenv from 'dotenv';

dotenv.config();

const CIRCLE_API_KEY = process.env.CIRCLE_API_KEY;
const CIRCLE_ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET;

if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    console.error("Error: CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must be set in your .env file.");
    process.exit(1);
}

const client = initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY,
    entitySecret: CIRCLE_ENTITY_SECRET,
});

async function main() {
    const action = process.argv[2] || 'list';

    if (action === 'list') {
        console.log("Listing Wallet Sets...");
        try {
            const walletSets = await client.listWalletSets();
            console.log("\n=================== WALLET SETS ===================");
            console.log(JSON.stringify(walletSets.data, null, 2));

            console.log("\nListing Wallets...");
            const wallets = await client.listWallets();
            console.log("\n===================== WALLETS =====================");
            console.log(JSON.stringify(wallets.data, null, 2));
            console.log("===================================================\n");
        } catch (error: any) {
            console.error("Error listing wallets/sets:", error.message || error);
        }
    } else if (action === 'create-set') {
        const name = process.argv[3] || 'ATO Wallet Set';
        console.log(`Creating Wallet Set with name: "${name}"...`);
        try {
            const response = await client.createWalletSet({
                name: name
            });
            console.log("\n=================== WALLET SET CREATED ===================");
            console.log(JSON.stringify(response.data, null, 2));
            console.log("=========================================================\n");
            if (response.data && response.data.walletSet) {
                console.log("Next, you can create a wallet in this set using:");
                console.log(`npx ts-node scripts/circleWallets.ts create-wallet ${response.data.walletSet.id}`);
            }
        } catch (error: any) {
            console.error("Error creating wallet set:", error.message || error);
        }
    } else if (action === 'create-wallet') {
        const walletSetId = process.argv[3];
        if (!walletSetId) {
            console.error("Error: You must provide a walletSetId. Usage: npx ts-node scripts/circleWallets.ts create-wallet <walletSetId>");
            process.exit(1);
        }
        
        console.log(`Creating Developer-Controlled Wallet in set ${walletSetId}...`);
        try {
            const response = await client.createWallets({
                walletSetId: walletSetId,
                blockchains: ['ETH-SEPOLIA'], // Circle supports ['ETH-SEPOLIA'], ['AVAX-FUJI'], etc.
                count: 1
            });
            console.log("\n=================== WALLET CREATED ===================");
            console.log(JSON.stringify(response.data, null, 2));
            console.log("======================================================");
            if (response.data && response.data.wallets && response.data.wallets.length > 0) {
                console.log(`\nUpdate your .env file with:`);
                console.log(`CIRCLE_WALLET_ID=${response.data.wallets[0].id}`);
            }
        } catch (error: any) {
            console.error("Error creating wallet:", error.message || error);
        }
    } else {
        console.log("Unknown action. Available actions: list, create-set, create-wallet <walletSetId>");
    }
}

main().catch(console.error);
