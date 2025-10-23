"use client";
import { useState } from "react";

export default function HomePage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [ref, setRef] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [includeSeparated, setIncludeSeparated] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function extractRepoName(url: string): string {
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        // Return owner-repo format
        return `${parts[0]}-${parts[1]}`;
      }
      return "repo-to-text";
    } catch {
      return "repo-to-text";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          repoUrl: repoUrl.trim(), 
          ref: ref.trim() || undefined,
          githubToken: githubToken.trim() || undefined,
          includeSeparated 
        })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const repoName = extractRepoName(repoUrl);
      
      // Try to use File System Access API for modern browsers (Chromium-based)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as typeof window & {
            showSaveFilePicker: (options: {
              suggestedName: string;
              types: { description: string; accept: Record<string, string[]> }[];
            }) => Promise<FileSystemFileHandle>;
          }).showSaveFilePicker({
            suggestedName: `${repoName}.zip`,
            types: [{
              description: 'ZIP Archive',
              accept: { 'application/zip': ['.zip'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (err) {
          // User cancelled or API not supported, fall back to download link
          if (err instanceof Error && err.name === 'AbortError') {
            return; // User cancelled, don't proceed with fallback
          }
        }
      }
      
      // Fallback for older browsers
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${repoName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-2xl rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Repo → Text Converter</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Paste a public GitHub/GitLab/Bitbucket repo URL. Optionally set a branch/ref.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Repository URL</span>
            <input
              type="url"
              required
              placeholder="https://github.com/owner/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:ring"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">Branch / Ref (optional)</span>
            <input
              type="text"
              placeholder="main"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:ring"
            />
          </label>

          <label className="block">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">GitHub Token (optional)</span>
              <span className="text-xs text-neutral-500">For private/org repos</span>
            </div>
            <input
              type="password"
              placeholder="ghp_... or github_pat_..."
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 outline-none focus:ring font-mono text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Create a{" "}
              <a 
                href="https://github.com/settings/tokens/new?scopes=repo&description=Repo%20to%20Text%20Converter" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                classic
              </a>
              {" "}or{" "}
              <a 
                href="https://github.com/settings/personal-access-tokens/new" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                fine-grained
              </a>
              {" "}token with <code className="bg-neutral-100 px-1 rounded">repo</code> scope
            </p>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSeparated}
              onChange={(e) => setIncludeSeparated(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-black focus:ring-black"
            />
            <span className="text-sm font-medium">Include separated files folder</span>
            <span className="text-xs text-neutral-500">(one .txt per source file)</span>
          </label>

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Converting…" : "Convert & Download ZIP"}
          </button>
          
          {error && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              <div className="font-semibold mb-1">Error:</div>
              <pre className="whitespace-pre-wrap font-mono text-xs">{error}</pre>
            </div>
          )}
        </form>

        <div className="mt-6 space-y-4">
          <details className="text-sm text-neutral-600">
            <summary className="cursor-pointer select-none font-medium text-neutral-800">What gets included?</summary>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Common code/text extensions (ts, js, tsx, py, md, yml, etc.).</li>
              <li>Skips binaries, archives, and &gt;2MB files.</li>
              <li>Ignores typical build output and vendor folders.</li>
              <li><strong>{`{owner}-{repo}-{branch}-combined.txt`}</strong> - all files concatenated with clear separators.</li>
              <li><strong>separated/</strong> folder (optional) - individual .txt files with path-encoded names.</li>
              <li><strong>manifest.json</strong> - metadata about the conversion.</li>
            </ul>
          </details>

          <details className="text-sm text-neutral-600">
            <summary className="cursor-pointer select-none font-medium text-neutral-800">Private & Organization Repos</summary>
            <div className="mt-2 space-y-2">
              <p>To access private or organization-owned repositories:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Create a GitHub Personal Access Token with <code className="bg-neutral-100 px-1 rounded">repo</code> scope</li>
                <li>For org repos, ensure the token has access to that organization</li>
                <li>Paste the token in the &ldquo;GitHub Token&rdquo; field above</li>
                <li>The token is sent directly to GitHub and never stored</li>
              </ol>
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                ⚠️ <strong>Security Note:</strong> Your token is processed server-side but never logged or stored. 
                For maximum security, create a token with minimal scopes and revoke it after use.
              </p>
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}
