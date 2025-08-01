import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerJSDoc from 'swagger-jsdoc';
import { swaggerOptions } from '../src/config/swagger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate swagger specification
const specs = swaggerJSDoc(swaggerOptions);

// Write to file
const outputPath = path.join(__dirname, '..', 'swagger.json');
fs.writeFileSync(outputPath, JSON.stringify(specs, null, 2));

console.log(`✅ Swagger JSON exported to: ${outputPath}`);
console.log('📋 You can now copy this file to your frontend project');