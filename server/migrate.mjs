import {makeApp} from './index.mjs';
const {client}=await makeApp();console.log('SQLite migration initialized.');client.close();
