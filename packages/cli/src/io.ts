import { mkdir, readdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, extname, join } from "node:path";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function safeWriteFile(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, content, "utf-8");
}

export async function safeUnlink(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf-8");
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readText(path)) as T;
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await safeWriteFile(path, `${JSON.stringify(data, null, 2)}\n`);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function listFiles(dir: string, extension?: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (extension ? entry.name.endsWith(extension) : true))
      .map((entry) => join(dir, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function readJsonlFiles(paths: string[]): Promise<unknown[]> {
  const events: unknown[] = [];
  for (const path of paths) {
    const text = await readText(path);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      events.push(JSON.parse(trimmed));
    }
  }
  return events;
}

export async function listJsonlFiles(dir: string): Promise<string[]> {
  const files = await listFiles(dir);
  return files.filter((f) => extname(f) === ".jsonl").sort();
}

export async function askQuestion(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  } finally {
    rl.close();
  }
}

export async function askPassword(prompt = "Password: "): Promise<string> {
  const stdin = process.stdin;
  const stdout = process.stdout;

  if (!stdin.isTTY) {
    return askQuestion(prompt);
  }

  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let password = "";
    const onData = (char: string) => {
      if (char === "\u0003") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        reject(new Error("Cancelled"));
        return;
      }
      if (char === "\r" || char === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(password);
        return;
      }
      if (char === "\u007f" || char === "\b") {
        if (password.length > 0) {
          password = password.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }
      password += char;
      stdout.write("*");
    };

    stdin.on("data", onData);
  });
}

export async function askChoice(prompt: string, choices: string[]): Promise<string> {
  const normalized = choices.map((c) => c.toLowerCase());
  while (true) {
    const answer = (await askQuestion(prompt)).toLowerCase();
    if (normalized.includes(answer)) {
      return answer;
    }
    console.log(`Please enter one of: ${choices.join(", ")}`);
  }
}
