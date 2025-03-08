import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register ts-node loader
register('ts-node/esm', pathToFileURL('./'));

// Import and run the main script
import('./index.js')
  .catch(error => {
    console.error('Failed to load the application:', error);
    process.exit(1);
  }); 