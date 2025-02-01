import * as fs from "fs/promises"
import * as cproc from "child_process"

export async function InstallNpmRequirements(reqPath: string, ttsName: string): Promise<void>
{
    console.log("[LOG] Checking npm dependencies for TTS:", ttsName);

    // Check for currently installed packages
    try
    {
        var installedDepsResp = cproc.execSync("npm list --depth=0 --json", {
            cwd: process.cwd()
        });
    }
    catch(e)
    {
        console.error("[ERROR] Failed to get currently installed npm packages.");
        console.error("[ERROR] Error:", e);
        process.exit(1);
    }

    if (!installedDepsResp)
    {
        console.error("[ERROR] Could not read currently installed npm packages.");
        process.exit(1);
    }

    // Parse output json
    try
    {
        var installedDepsJson = JSON.parse(installedDepsResp.toString("utf8"));
    }
    catch
    {
        console.error("[ERROR] Failed to parse currently installed npm packages.");
        process.exit(1);
    }

    // Read requirements file
    try
    {
        var depsStr = await fs.readFile(reqPath, { encoding: "utf8" });
    }
    catch
    {
        console.error("[ERROR] Failed to read npm requirements file.");
        process.exit(1);
    }

    const installedDeps: string[] = [];

    for (let [key, _] of Object.entries(installedDepsJson["dependencies"]))
    {
        installedDeps.push(key);
    }

    const lines: string[] = depsStr.split(/\r\n|\n/g);

    for (let line of lines)
    {
        if (line.trim() == "") continue;

        let atIdx = line.lastIndexOf("@");

        if (atIdx == -1)
        {
            console.error("[ERROR] Failed to parse npm requirements file.");
            console.error("[ERROR] Each lines must have format:");
            console.error("[ERROR] <npm package name>@<version>");
            process.exit(1);
        }

        let packageName = line.substring(0, atIdx);
        let packageVersion = line.substring(atIdx + 1);

        packageName = packageName.replaceAll(/[\x00-\x1F\x7F;&|`$<>(){}[\]]/g, "");
        packageVersion = packageVersion.replaceAll(/[\x00-\x1F\x7F;&|`$<>(){}[\]]/g, "");

        if (installedDeps.includes(packageName))
        {
            console.log(`[LOG] Npm package ${packageName} is already installed.`);
            continue;
        }

        try
        {
            var installResp = cproc.execSync(`npm install ${packageName}@${packageVersion} --save-dev`);
        }
        catch (e)
        {
            console.error("[ERROR] Failed to install npm package:", packageName, packageVersion);
            console.error("[ERROR] Error:", e);
            process.exit(1);
        }
        
        if (!installResp)
        {
            console.error("[ERROR] Error when trying to install npm package:", packageName, packageVersion);
            process.exit(1);
        }
        else
        {
            console.log("[LOG] Installed npm package:", packageName, packageVersion);
        }
    }
    console.log("[LOG] Finished handling npm dependencies for TTS:", ttsName);
}