const fs = require('fs');
const path = require('path');

const projectPath = path.resolve(process.argv[2] || path.join(__dirname, '../examples/demo-project/demo.anime'));
if (!fs.existsSync(projectPath)) {
    console.error(`Project file not found: ${projectPath}`);
    process.exit(1);
}

const content = fs.readFileSync(projectPath, 'utf-8');
const lines = content.split('\n');

console.log(`Searching for layerPresetId and partAssetOverrides in ${projectPath}...`);

lines.forEach((line, index) => {
    if (line.includes('layerPresetId')) {
        console.log(`Found layerPresetId at line ${index + 1}: ${line.trim()}`);
        // context
        for (let i = Math.max(0, index - 5); i < Math.min(lines.length, index + 5); i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
    if (line.includes('partAssetOverrides')) {
        console.log(`Found partAssetOverrides at line ${index + 1}: ${line.trim()}`);
        // context
        for (let i = Math.max(0, index - 5); i < Math.min(lines.length, index + 5); i++) {
            console.log(`${i + 1}: ${lines[i]}`);
        }
    }
});
