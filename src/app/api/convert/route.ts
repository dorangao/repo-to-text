import JSZip from "jszip";

export const runtime = "nodejs"; // ensure Node runtime (needed for Buffer)

// ---- Config: filters & limits ----
const MAX_FILE_BYTES = 2 * 1024 * 1024; // skip files bigger than 2 MB
const IGNORE_DIR_PREFIXES = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "out/",
  "target/",
  "coverage/",
  "venv/",
  "__pycache__/"
];
const ALLOWED_EXTS = new Set([
  // web / ts
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  // styles & markup & content
  "css", "scss", "sass", "less", "html", "htm", "md", "mdx",
  // configs & data
  "json", "yml", "yaml", "toml", "ini", "cfg", "conf", "env", "xml",
  // many languages
  "py", "java", "kt", "kts", "go", "rs", "rb", "php", "cs", "cpp", "c", "h", "hpp",
  "scala", "swift", "dart", "sql", "sh", "bash", "zsh", "ps1", "lua", "r", "pl", "hs",
  // frameworks
  "vue", "svelte", "astro"
]);

function looksLikeTextByExt(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext) return false;
  return ALLOWED_EXTS.has(ext);
}

function shouldIgnorePath(relPath: string) {
  const normalized = relPath.replace(/\\/g, "/");
  return IGNORE_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

// Map repo URL → downloadable archive URL candidates
function buildArchiveCandidates(repoUrl: string, ref?: string, hasToken = false): string[] {
  const u = new URL(repoUrl);
  const host = u.hostname.toLowerCase();
  const path = u.pathname.replace(/\.git$/, "");
  const parts = path.split("/").filter(Boolean);

  // Extract branch/ref if given as /tree/<ref>
  if (parts.length >= 4 && parts[2] === "tree" && !ref) {
    ref = parts[3];
  }

  const branchCandidates = ref ? [ref] : ["main", "master", "default"];

  // If the incoming URL is a direct zip, just use it
  if (/\.zip$/i.test(u.pathname)) {
    return [repoUrl];
  }

  if (host.endsWith("github.com")) {
    if (parts.length < 2) throw new Error("Could not parse GitHub URL (owner/repo)");
    const owner = parts[0];
    const repo = parts[1];
    // Try multiple GitHub archive formats
    const urls: string[] = [];
    for (const b of branchCandidates) {
      // If token is provided, prioritize API endpoint (works better for private repos)
      if (hasToken) {
        urls.push(`https://api.github.com/repos/${owner}/${repo}/zipball/${b}`);
      }
      urls.push(`https://github.com/${owner}/${repo}/archive/refs/heads/${b}.zip`);
      urls.push(`https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${b}`);
      if (!hasToken) {
        urls.push(`https://api.github.com/repos/${owner}/${repo}/zipball/${b}`);
      }
    }
    return urls;
  }

  if (host.endsWith("gitlab.com")) {
    if (parts.length < 2) throw new Error("Could not parse GitLab URL");
    const ownerRepo = parts.slice(0, 2).join("/");
    return branchCandidates.map((b) => `https://gitlab.com/${ownerRepo}/-/archive/${b}/${parts[1]}-${b}.zip`);
  }

  if (host.endsWith("bitbucket.org")) {
    if (parts.length < 2) throw new Error("Could not parse Bitbucket URL");
    const owner = parts[0];
    const repo = parts[1];
    return branchCandidates.map((b) => `https://bitbucket.org/${owner}/${repo}/get/${b}.zip`);
  }

  // Unknown host: try as-is; user may have provided a direct archive URL
  return [repoUrl];
}

async function fetchFirstWorkingArchive(
  repoUrl: string, 
  ref?: string, 
  githubToken?: string
): Promise<ArrayBuffer> {
  const candidates = buildArchiveCandidates(repoUrl, ref, !!githubToken);
  const errors: string[] = [];
  
  for (const url of candidates) {
    try {
      console.log(`Trying: ${url}${githubToken ? ' (with token)' : ''}`);
      
      const headers: Record<string, string> = {
        "User-Agent": "repo-to-text/1.0",
        "Accept": "application/vnd.github+json"
      };
      
      // Add GitHub token for authentication if provided
      if (githubToken && url.includes('github.com')) {
        // Support both classic (ghp_) and fine-grained (github_pat_) tokens
        // Classic tokens use "token", fine-grained use "Bearer"
        const authPrefix = githubToken.startsWith('github_pat_') ? 'Bearer' : 'token';
        headers["Authorization"] = `${authPrefix} ${githubToken}`;
      }
      
      const res = await fetch(url, { 
        cache: "no-store", 
        headers,
        redirect: "follow"
      });
      
      if (!res.ok) {
        const statusMsg = `${res.status} ${res.statusText}`;
        errors.push(`${url} → ${statusMsg}`);
        
        // Provide helpful error message for common auth issues
        if (res.status === 401 || res.status === 403) {
          if (githubToken) {
            errors.push(`  ⚠️ Token may be invalid or lack required permissions (needs 'repo' scope)`);
          } else {
            errors.push(`  💡 This might be a private repo - try adding a GitHub token`);
          }
        }
        continue;
      }
      
      console.log(`Success: ${url}`);
      return await res.arrayBuffer();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${url} → ${message}`);
      continue;
    }
  }
  
  throw new Error(`Failed to fetch archive from any URL. Tried:\n${errors.join('\n')}`);
}

function commonZipRootPrefix(fileNames: string[]): string {
  // Most provider archives put everything under one top-level folder like
  // "repo-branch/…" — detect and strip that for cleaner relative paths.
  if (fileNames.length === 0) return "";
  const first = fileNames[0];
  const slash = first.indexOf("/");
  if (slash > 0) {
    const prefix = first.slice(0, slash + 1);
    // verify all files share this prefix
    if (fileNames.every((n) => n.startsWith(prefix))) return prefix;
  }
  return "";
}

function extractRepoInfo(repoUrl: string, ref?: string): { owner: string; repo: string; branch: string } {
  try {
    const u = new URL(repoUrl);
    const path = u.pathname.replace(/\.git$/, "");
    const parts = path.split("/").filter(Boolean);
    
    // Extract branch from URL if present (e.g., /tree/branch-name)
    let branch = ref;
    if (parts.length >= 4 && parts[2] === "tree" && !branch) {
      branch = parts[3];
    }
    
    if (parts.length >= 2) {
      return {
        owner: parts[0],
        repo: parts[1],
        branch: branch || "main"
      };
    }
  } catch {
    // ignore parse errors
  }
  
  return {
    owner: "repo",
    repo: "export",
    branch: ref || "main"
  };
}

export async function POST(req: Request) {
  try {
    const { repoUrl, ref, githubToken, includeSeparated = true } = await req.json();
    if (!repoUrl || typeof repoUrl !== "string") {
      return new Response(JSON.stringify({ error: "Missing repoUrl" }), { status: 400 });
    }

    const archiveBuf = await fetchFirstWorkingArchive(repoUrl, ref, githubToken);
    const zip = await JSZip.loadAsync(Buffer.from(archiveBuf));

    const fileEntries = Object.values(zip.files).filter((f) => !f.dir);
    const names = fileEntries.map((f) => f.name);
    const rootPrefix = commonZipRootPrefix(names);

    // Extract repo info for naming
    const repoInfo = extractRepoInfo(repoUrl, ref);
    const combinedFilename = `${repoInfo.owner}-${repoInfo.repo}-${repoInfo.branch}-combined.txt`;

    const output = new JSZip();
    let combined = "";
    let includedCount = 0;

    for (const entry of fileEntries) {
      const fullName = entry.name.replace(/\\/g, "/");
      const relPath = rootPrefix && fullName.startsWith(rootPrefix) ? fullName.slice(rootPrefix.length) : fullName;
      if (!relPath) continue; // safety
      if (shouldIgnorePath(relPath)) continue;
      if (!looksLikeTextByExt(relPath)) continue;

      const content = await entry.async("string");
      const byteLength = Buffer.byteLength(content, "utf8");
      if (byteLength > MAX_FILE_BYTES) continue;

      // Append to combined with separators
      combined += `\n----- BEGIN FILE: ${relPath} -----\n`;
      combined += content.replace(/\u0000/g, "");
      combined += `\n----- END FILE: ${relPath} -----\n`;

      // Add to separated folder only if requested
      if (includeSeparated) {
        const safeName = relPath.replace(/[\\/]/g, "__") + ".txt";
        output.folder("separated")?.file(safeName, content);
      }
      includedCount++;
    }

    // Add manifest & combined
    output.file(combinedFilename, combined.trimStart());
    output.file("manifest.json", JSON.stringify({
      repoUrl,
      ref: ref ?? null,
      includedFiles: includedCount,
      includeSeparated,
      combinedFilename,
      filters: {
        maxFileBytes: MAX_FILE_BYTES,
        ignorePrefixes: IGNORE_DIR_PREFIXES,
        allowedExts: Array.from(ALLOWED_EXTS)
      },
      generatedAt: new Date().toISOString()
    }, null, 2));

    const outBuf = await output.generateAsync({ type: "nodebuffer" });
    return new Response(outBuf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": "attachment; filename=repo-to-text.zip"
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}

