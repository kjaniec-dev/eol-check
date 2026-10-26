import type { Component } from '../types.ts';

// Preserve quoted literals while removing comments; never evaluate build scripts.
function withoutComments(text: string): string {
  return text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (token) => token.startsWith('//') || token.startsWith('/*') ? token.replace(/[^\r\n]/g, ' ') : token);
}

/** Conservative extraction of Java language levels and Spring Boot plugin versions. */
export function parseGradle(text: string, source = 'build.gradle'): Component[] {
  source = source.split(/[\\/]/).pop()!;
  const clean = withoutComments(text);
  const out: Component[] = [];
  const toolchain = /\bJavaLanguageVersion\s*\.\s*of\s*\(([^)]*)\)/.exec(clean);
  const compatibility = /\bsourceCompatibility(?:[ \t]*=[ \t]*|[ \t]*\([ \t]*|[ \t]+)([^;\r\n}]+)/.exec(clean);
  if (toolchain || compatibility) {
    const declared = (toolchain?.[1] ?? compatibility![1]!).trim();
    let version: string | null;
    if (toolchain) version = /^\d+$/.test(declared) ? declared : null;
    else {
      const literal = /^(?:JavaVersion\.VERSION_(\d+(?:_\d+)*)|(['"])(\d+(?:\.\d+)*)\2)\s*\)?\s*$/.exec(declared);
      version = literal ? (literal[1]?.replace(/_/g, '.') ?? literal[3]!) : null;
    }
    if (version?.startsWith('1.')) version = version.slice(2);
    const blockStart = toolchain ? clean.lastIndexOf('{', toolchain.index) : -1;
    const blockEnd = toolchain ? clean.indexOf('}', toolchain.index) : -1;
    const vendorScope = blockStart >= 0 && blockEnd >= 0 ? clean.slice(blockStart, blockEnd) : '';
    const vendor = toolchain ? /\bvendor\s*(?:=\s*|\.\s*set\s*\(\s*)JvmVendorSpec\.(ADOPTIUM|AMAZON)\b/.exec(vendorScope)?.[1] : undefined;
    const product = vendor === 'ADOPTIUM' ? 'eclipse-temurin' : vendor === 'AMAZON' ? 'amazon-corretto' : null;
    out.push({ source, kind: 'runtime', label: `Java ${declared}`, product,
      productLabel: vendor === 'ADOPTIUM' ? 'Eclipse Temurin' : vendor === 'AMAZON' ? 'Amazon Corretto' : 'Java', version });
  }
  const plugin = /\bid\s*(?:\(\s*)?(['"])org\.springframework\.boot\1\s*\)?\s*\.?\s*version\s*(?:\(\s*)?(?:(['"])([^'"\r\n]*)\2|([^\s;})]+))/g;
  for (const match of clean.matchAll(plugin)) {
    const declared = match[3] ?? match[4]!;
    const tail = clean.slice(match.index! + match[0].length);
    const computed = /^[ \t]*\)?[ \t]*[+.$?:*/-]/.test(tail);
    const version = !computed && /^\d+\.\d+(?:\.\d+)*(?:-[A-Za-z0-9.-]+)?$/.test(declared) ? declared : null;
    out.push({ source, kind: 'framework', label: `spring-boot ${declared}`, product: 'spring-boot', version });
  }
  return out;
}
