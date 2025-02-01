const cproc = require("child_process");

if (process.cwd() != __dirname)
{
    process.chdir(__dirname);
}

let maybePort = process.argv[2];
let port = 7563;

if (maybePort)
{
    port = Number(maybePort);

    if (port == NaN)
    {
        console.error("[ERROR] Second argument of call to start_module.js is an invalid port number:", maybePort);
        return;
    }
}

let res = cproc.execSync(`npx tsx index.ts ${port}`, {
    cwd: __dirname,
    stdio: [ process.stdin, process.stdout, process.stderr ],
});

if (res)
{
    console.error("[ERROR] Module closed with:", res.toString("utf8"));
}

return res ? 1 : 0;