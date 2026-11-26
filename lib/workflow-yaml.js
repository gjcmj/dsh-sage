// 极简 YAML 解析器：只支持 workflow 模板用到的子集（缩进映射 / 行内数组 / 布尔 / 数字 / 字符串）。
//
// 为什么要自己写：本包零依赖；而模板是数据、必须能被人手改。解析失败要**报错并给行号**，
// 不允许静默降级成默认值（否则「改了模板没生效」会变成最难查的故障）。

/** 解析失败时抛出带行号的错误。 */
function fail(lineNo, message) {
  const e = new Error("YAML 第 " + lineNo + " 行：" + message);
  e.line = lineNo;
  throw e;
}

/** 去掉行尾注释（只处理不在引号里的 #，本子集足够）。 */
function stripComment(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === "\"" && !inS) inD = !inD;
    else if (c === "#" && !inS && !inD && (i === 0 || line[i - 1] === " ")) return line.slice(0, i);
  }
  return line;
}

function scalar(raw, lineNo) {
  const s = raw.trim();
  if (s === "") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null" || s === "~") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((x) => x.trim()).filter(Boolean);
  }
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith("\"") && s.endsWith("\""))) return s.slice(1, -1);
  return s;
}

/**
 * 解析 YAML 子集。
 * @param text - 模板文本。
 * @returns 普通对象/数组/标量。
 */
export function parseYaml(text) {
  const rows = [];
  String(text || "").split("\n").forEach((line, idx) => {
    const no = idx + 1;
    if (line.includes("\t")) fail(no, "不允许制表符（用两个空格缩进）");
    const clean = stripComment(line);
    if (!clean.trim()) return;
    const indent = clean.match(/^ */)[0].length;
    if (indent % 2 !== 0) fail(no, "缩进必须是 2 的倍数（当前 " + indent + "）");
    rows.push({ no, indent, text: clean.trim() });
  });
  if (!rows.length) return {};
  let i = 0;
  function block(indent) {
    if (i >= rows.length) return {};
    if (rows[i].text.startsWith("- ")) {
      const arr = [];
      while (i < rows.length && rows[i].indent === indent && rows[i].text.startsWith("- ")) {
        arr.push(scalar(rows[i].text.slice(2), rows[i].no));
        i += 1;
      }
      return arr;
    }
    const obj = {};
    while (i < rows.length && rows[i].indent === indent) {
      const row = rows[i];
      const m = /^([^:]+):\s*(.*)$/.exec(row.text);
      if (!m) fail(row.no, "无法解析（应形如 key: value）：" + row.text);
      const key = m[1].trim();
      const rest = m[2];
      i += 1;
      if (rest === "") {
        if (i < rows.length && rows[i].indent > indent) obj[key] = block(rows[i].indent);
        else obj[key] = null;
      } else obj[key] = scalar(rest, row.no);
    }
    return obj;
  }
  const out = block(rows[0].indent);
  if (i < rows.length) fail(rows[i].no, "缩进层级不连续");
  return out;
}
