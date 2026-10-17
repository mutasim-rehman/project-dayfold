import {defineConfig} from "@playwright/test";
export default defineConfig({testDir:"e2e",fullyParallel:false,workers:1,use:{baseURL:process.env.TEST_APP_URL||"http://127.0.0.1:3000"},reporter:"list"});
