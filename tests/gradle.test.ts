import { describe, expect, it } from 'vitest';
import { parseGradle } from '../src/lib/parsers/gradle.ts';

describe('Gradle manifests', () => {
  it('reads Java toolchains and uses explicit supported vendor lifecycles', () => {
    expect(
      parseGradle(
        'java { toolchain { languageVersion = JavaLanguageVersion.of(17)\nvendor = JvmVendorSpec.ADOPTIUM } }',
        'app/build.gradle.kts',
      )[0],
    ).toMatchObject({ source: 'build.gradle.kts', product: 'eclipse-temurin', version: '17' });
    expect(
      parseGradle(
        'java { toolchain { languageVersion.set(JavaLanguageVersion.of(21)); vendor.set(JvmVendorSpec.AMAZON) } }',
      )[0]?.product,
    ).toBe('amazon-corretto');
  });
  it.each([
    'sourceCompatibility = JavaVersion.VERSION_17',
    "sourceCompatibility = '17'",
    'sourceCompatibility = JavaVersion.VERSION_1_8',
  ])('reads compatibility %s', (text) => {
    expect(parseGradle(text)[0]).toMatchObject({
      source: 'build.gradle',
      product: null,
      productLabel: 'Java',
      version: text.includes('1_8') ? '8' : '17',
    });
  });
  it.each([
    "plugins { id 'org.springframework.boot' version '3.3.1' }",
    'plugins { id("org.springframework.boot") version "3.4.0" }',
  ])('reads Spring Boot plugin declarations', (text) => {
    expect(parseGradle(text)[0]).toMatchObject({
      kind: 'framework',
      product: 'spring-boot',
      version: text.includes('3.3') ? '3.3.1' : '3.4.0',
    });
  });
  it('keeps dynamic language and plugin versions unknown', () => {
    const out = parseGradle(
      'languageVersion = JavaLanguageVersion.of(javaVersion)\nplugins { id("org.springframework.boot") version bootVersion }',
    );
    expect(out.map((c) => c.version)).toEqual([null, null]);
    expect(
      parseGradle('plugins { id("org.springframework.boot") version "3.+" }')[0]?.version,
    ).toBeNull();
    expect(
      parseGradle('plugins { id("org.springframework.boot") version "${bootVersion}" }')[0]
        ?.version,
    ).toBeNull();
  });
  it('ignores comments and unrelated vendor declarations', () => {
    expect(
      parseGradle(
        '// JavaLanguageVersion.of(8)\n/* id("org.springframework.boot") version "1.0" */',
      ),
    ).toEqual([]);
    expect(
      parseGradle('sourceCompatibility = "17"\n// vendor = JvmVendorSpec.AMAZON')[0]?.product,
    ).toBeNull();
  });
});

it('does not turn concatenated or computed declarations into pinned versions', () => {
  expect(
    parseGradle('languageVersion = JavaLanguageVersion.of(17 + offset)')[0]?.version,
  ).toBeNull();
  expect(parseGradle('sourceCompatibility = "17" + suffix')[0]?.version).toBeNull();
  expect(
    parseGradle('plugins { id("org.springframework.boot") version "3.3.1" + suffix }')[0]?.version,
  ).toBeNull();
});
it('does not borrow a vendor from an unrelated toolchain block', () => {
  expect(
    parseGradle(
      'java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }\nother { vendor = JvmVendorSpec.AMAZON }',
    )[0]?.product,
  ).toBeNull();
});

it('reads Groovy compatibility method syntax and Kotlin dynamic plugin arguments', () => {
  expect(parseGradle("sourceCompatibility '17'")[0]?.version).toBe('17');
  expect(parseGradle('sourceCompatibility JavaVersion.VERSION_17')[0]?.version).toBe('17');
  expect(
    parseGradle('plugins { id("org.springframework.boot").version(bootVersion) }')[0],
  ).toMatchObject({ product: 'spring-boot', version: null });
});
