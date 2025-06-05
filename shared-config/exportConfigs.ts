// /shared-configs/exportConfigs.ts
import { sharedTableConfigs } from './column';
import fs from 'fs';
import path from 'path';

const exportConfigs = () => {
  const configJson = JSON.stringify(sharedTableConfigs, null, 2);
  const outputPath = path.join(__dirname, '../../app/config/tableConfigs.json');
  fs.writeFileSync(outputPath, configJson, 'utf-8');
  console.log(`Exported sharedTableConfigs to ${outputPath}`);
};

exportConfigs();