import { cargo, native, run } from "./toolchain";

await run([cargo, ...process.argv.slice(2)], native);
