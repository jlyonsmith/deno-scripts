#!/usr/bin/env -S deno run --allow-read --allow-run
console.info("Checking for uncommitted changes...")

if (isUncommittedChanges()) {
  console.error(
    "There are uncomitted changes - commit or stash them and try again"
  )
  Deno.exit(1)
}

Deno.exit(0)

export default async function isUncommittedChanges() {
  return !(
    await Deno.run({
      cmd: ["git", "diff-index", "--quiet", "HEAD", "--"],
      stderr: "null",
      stdout: "null",
    }).status()
  ).success
}
