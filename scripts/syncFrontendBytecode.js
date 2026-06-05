const fs = require('fs');
const path = require('path');

const ARTIFACT_PATH = 'artifacts/contracts/ATOEnterpriseVault.sol/ATOEnterpriseVault.json';
const TARGET_PATH = 'frontend/src/contractBytecode.ts';

function main() {
    if (!fs.existsSync(ARTIFACT_PATH)) {
        console.error(`Artifact not found at: ${ARTIFACT_PATH}`);
        process.exit(1);
    }
    if (!fs.existsSync(TARGET_PATH)) {
        console.error(`Target file not found at: ${TARGET_PATH}`);
        process.exit(1);
    }

    const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, 'utf8'));
    const newAbi = JSON.stringify(artifact.abi, null, 2);
    const newBytecode = artifact.bytecode;

    let targetContent = fs.readFileSync(TARGET_PATH, 'utf8');

    // Replace ATO_VAULT_ABI
    const abiStartIdx = targetContent.indexOf('export const ATO_VAULT_ABI =');
    const abiEndIdx = targetContent.indexOf('] as const;', abiStartIdx);
    if (abiStartIdx === -1 || abiEndIdx === -1) {
        console.error('Could not locate ATO_VAULT_ABI in target file.');
        process.exit(1);
    }
    
    // Replace ATO_VAULT_BYTECODE
    const bytecodeStartIdx = targetContent.indexOf('export const ATO_VAULT_BYTECODE =');
    const bytecodeEndIdx = targetContent.indexOf('";', bytecodeStartIdx);
    if (bytecodeStartIdx === -1 || bytecodeEndIdx === -1) {
        console.error('Could not locate ATO_VAULT_BYTECODE in target file.');
        process.exit(1);
    }

    // We reconstruct the file
    // Let's replace the bytecode first since it's simpler
    const beforeBytecode = targetContent.substring(0, bytecodeStartIdx);
    const afterBytecode = targetContent.substring(bytecodeEndIdx + 2);
    targetContent = beforeBytecode + `export const ATO_VAULT_BYTECODE = "${newBytecode}";` + afterBytecode;

    // Now re-locate and replace ABI
    const newAbiStartIdx = targetContent.indexOf('export const ATO_VAULT_ABI =');
    const newAbiEndIdx = targetContent.indexOf('] as const;', newAbiStartIdx);
    const beforeAbi = targetContent.substring(0, newAbiStartIdx);
    const afterAbi = targetContent.substring(newAbiEndIdx + 11);
    targetContent = beforeAbi + `export const ATO_VAULT_ABI = ${newAbi} as const;` + afterAbi;

    fs.writeFileSync(TARGET_PATH, targetContent, 'utf8');
    console.log('Successfully synchronized ATO_VAULT_ABI and ATO_VAULT_BYTECODE in frontend!');
}

main();
