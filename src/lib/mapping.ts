// Maps names used in manifests to endoflife.date product slugs.
// scripts/fetch-eol.ts fails on slugs missing from the API, so typos surface at build time.
// null keeps recognised components visible as unknown without requesting nonexistent products.

export const DOCKER_IMAGES: Record<string, string | null> = {
  node: 'nodejs',
  python: 'python',
  golang: 'go',
  php: 'php',
  ruby: 'ruby',
  openjdk: null, // No generic Java lifecycle; support depends on the distribution.
  'eclipse-temurin': 'eclipse-temurin',
  amazoncorretto: 'amazon-corretto',
  'dotnet/sdk': 'dotnet',
  'dotnet/aspnet': 'dotnet',
  'dotnet/runtime': 'dotnet',
  postgres: 'postgresql',
  mysql: 'mysql',
  mariadb: 'mariadb',
  redis: 'redis',
  mongo: 'mongodb',
  nginx: 'nginx',
  httpd: 'apache-http-server',
  tomcat: 'tomcat',
  rabbitmq: 'rabbitmq',
  elasticsearch: 'elasticsearch',
  ubuntu: 'ubuntu',
  debian: 'debian',
  alpine: 'alpine-linux',
};

// Base-image tags are often codenames instead of versions.
export const CODENAMES: Record<string, Record<string, string>> = {
  debian: { buster: '10', bullseye: '11', bookworm: '12', trixie: '13' },
  ubuntu: { bionic: '18.04', focal: '20.04', jammy: '22.04', noble: '24.04' },
};

export const NPM_PACKAGES: Record<string, string | null> = {
  react: 'react',
  next: 'nextjs',
  vue: 'vue',
  nuxt: 'nuxt',
  '@angular/core': 'angular',
  typescript: null, // Not tracked by endoflife.date.
  express: 'express',
  jquery: 'jquery',
  bootstrap: 'bootstrap',
  electron: 'electron',
};

export const NODE = 'nodejs';
export const GO = 'go';
export const JAVA = null; // pom.xml specifies a language level, not a JDK distribution.
export const SPRING_BOOT = 'spring-boot';

export function allProductSlugs(): string[] {
  return [
    ...new Set([
      ...Object.values(DOCKER_IMAGES),
      ...Object.values(NPM_PACKAGES),
      NODE,
      GO,
      JAVA,
      SPRING_BOOT,
    ].filter((slug): slug is string => slug !== null)),
  ];
}
