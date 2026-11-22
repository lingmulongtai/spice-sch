// Build the portable app using the same assets as the multi-file version.
const fs = require("node:fs");
const path = require("node:path");
const read = (filename) => fs.readFileSync(path.join(__dirname, filename), "utf8");
const html = read("index.html")
  .replace(/<link rel="stylesheet" href="style.css"\s*\/?>/, () => "<style>" + read("style.css") + "</style>")
  .replace(/\s*<script defer src="(?:converter|app)\.js"><\/script>/g, "")
  .replace("</body>", () => ["converter.js", "app.js"].map(name => "<script>\n" + read(name) + "\n</script>").join("\n") + "\n</body>");
fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "dist", "Spice-SCH.html"), html);
