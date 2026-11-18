// Try draft_copy directly. Usage: npm run copy:test -- "post about ..."
import { getBusiness, listPosts } from "../src/db/index.js";
import { draftCopy } from "../src/copy/draftCopy.js";

const request = process.argv.slice(2).join(" ") || "post about our fall gutter cleaning, leaves are coming down";
const business = (await getBusiness("biz_demo_brightside"))!;
const history = await listPosts(business.business_id, 5);
const t = Date.now();
const result = await draftCopy(business, history, { request });
console.log(JSON.stringify(result, null, 2));
console.log(`(${((Date.now() - t) / 1000).toFixed(1)}s)`);
