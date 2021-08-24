#!/usr/bin/env -S deno run --unstable --allow-run --allow-read

import * as path from "https://deno.land/std@0.106.0/path/mod.ts"
import * as colors from "https://deno.land/std@0.106.0/fmt/colors.ts"
import * as fs from "https://deno.land/std@0.106.0/fs/mod.ts"

const log = {
  info: (s: string) => console.log("👉 " + colors.green(s)),
  error: (s: string) => console.error("💥 " + colors.red(s)),
  warning: (s: string) => console.error("🐓 " + colors.yellow(s)),
}

if (Deno.args.length < 1) {
  console.log(`${Deno.mainModule} <version-op>`)
  Deno.exit(1)
}

try {
  await main(Deno.args[0])
} catch (error) {
  log.error(error.message)
  Deno.exit(1)
}

Deno.exit(0)

async function main(versionOp: string) {
  const dirPath = Deno.cwd()

  if (!(await fs.exists("Cargo.toml"))) {
    throw new Error("Cargo.toml file not found")
  }

  log.info("Checking for uncommitted changes")

  if (
    !(
      await Deno.run({
        cmd: ["git", "diff-index", "--quiet", "HEAD", "--"],
        stderr: "null",
        stdout: "null",
      }).status()
    ).success
  ) {
    throw new Error(
      "There are uncomitted changes - commit or stash them and try again"
    )
  }

  const branch = new TextDecoder()
    .decode(
      await Deno.run({
        cmd: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        stderr: "null",
        stdout: "piped",
      }).output()
    )
    .trim()

  if (branch === "HEAD") {
    throw new Error("Cannot do release from a detached HEAD state")
  }

  const name = path.basename(dirPath)

  log.info(`Starting release of '${name}' on branch '${branch}'`)

  log.info(`Checking out '${branch}'`)
  await Deno.run({ cmd: ["git", "checkout", branch] }).status()

  log.info("Pulling latest")
  await Deno.run({ cmd: ["git", "pull"] }).status()

  log.info("Updating version")
  await fs.ensureDir(path.resolve(dirPath, "scratch"))

  await Deno.run({ cmd: ["npx", "@johnls/stampver", versionOp, "-u"] }).status()

  const tagName = new TextDecoder().decode(
    await Deno.readFile("scratch/version.tag.txt")
  )
  const tagDescription = new TextDecoder().decode(
    await Deno.readFile(path.resolve(dirPath, "scratch/version.desc.txt"))
  )

  const isNewTag = !(
    await Deno.run({ cmd: ["git", "rev-parse", tagName] }).status()
  ).success

  if (isNewTag) {
    log.info(`Confirmed that '${tagName}' is a new tag`)
  } else {
    log.warning(`Tag '${tagName}' already exists and will not be moved`)
  }

  // TODO: Run 'justfile coverage' if the file exist, and if that fails, run 'cargo tests'
  if (!(await Deno.run({ cmd: ["cargo", "test"] }).status()).success) {
    // Roll back version changes if anything went wrong
    await Deno.run({ cmd: ["git", "checkout", branch, "."] }).status()
    throw new Error(`Tests failed '${name}' on branch '${branch}'`)
  }

  log.info("Staging version changes")
  await Deno.run({ cmd: ["git", "add", ":/"] }).status()

  log.info("Committing version changes")
  await Deno.run({ cmd: ["git", "commit", "-m", tagDescription] }).status()

  if (isNewTag) {
    log.info("Tagging")
    await Deno.run({
      cmd: ["git", "tag", "-a", tagName, "-m", tagDescription],
    }).status()
  }

  log.info("Pushing to 'origin'")
  await Deno.run({ cmd: ["git", "push", "--follow-tags"] }).status()

  log.info(
    `Finished release of '${name}' on branch '${branch}'. You can publish the crate.`
  )
}
