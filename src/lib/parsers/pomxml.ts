import type { Component } from '../types.ts';
import { JAVA, SPRING_BOOT } from '../mapping.ts';

const SOURCE = 'pom.xml';

const JAVA_TAGS = [
  'java.version',
  'maven.compiler.release',
  'maven.compiler.source',
  'maven.compiler.target',
  'release',
];

/** "1.8" -> "8"; other values pass through. */
function normalizeJava(v: string): string {
  return v.startsWith('1.') ? v.slice(2) : v;
}

export function parsePomXml(text: string): Component[] {
  const out: Component[] = [];

  for (const tag of JAVA_TAGS) {
    const m = new RegExp(
      `<${tag.replace('.', '\\.')}>\\s*(\\d+(?:\\.\\d+)*)\\s*</${tag.replace('.', '\\.')}>`,
    ).exec(text);
    if (m) {
      out.push({
        source: SOURCE,
        kind: 'runtime',
        label: `Java (${tag}) ${m[1]}`,
        product: JAVA,
        version: normalizeJava(m[1]!),
      });
      break;
    }
  }

  const parent =
    /<parent>[\s\S]*?<artifactId>spring-boot-starter-parent<\/artifactId>\s*<version>\s*([\d.]+)/.exec(
      text,
    );
  if (parent) {
    out.push({
      source: SOURCE,
      kind: 'framework',
      label: `spring-boot ${parent[1]}`,
      product: SPRING_BOOT,
      version: parent[1]!,
    });
  }
  return out;
}
