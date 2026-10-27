import type { Component, VersionBasis } from './types.ts';

export interface VersionBasisInfo {
  label: string;
  explanation: string;
}

export function versionBasisInfo(component: Component): VersionBasisInfo {
  const basis: VersionBasis =
    component.versionBasis ?? (component.kind === 'image' ? 'image-reference' : 'declared');
  switch (basis) {
    case 'lockfile':
      return component.version
        ? {
            label: 'Resolved from lockfile',
            explanation:
              'Read as a resolved package version from a lockfile; this does not prove what is installed in a deployment.',
          }
        : {
            label: 'Lockfile entry',
            explanation:
              'A lockfile entry was found, but no valid resolved version could be extracted.',
          };
    case 'minimum':
      return {
        label: 'Minimum of declared range',
        explanation:
          'The checked version is the lowest version allowed by the declared range, not necessarily the version installed.',
      };
    case 'range':
      return {
        label: 'Declared range',
        explanation:
          'The input is a version constraint; no safe minimum version could be determined.',
      };
    case 'image-reference':
      return component.version
        ? {
            label: 'Image reference',
            explanation:
              'Interpreted from the image tag or name; tags can move and do not prove which version is running.',
          }
        : {
            label: 'Image reference',
            explanation: 'No runtime version could be inferred from this image reference.',
          };
    case 'target-framework':
      return {
        label: 'Target framework',
        explanation:
          'This is a compile-time compatibility target, not a pin of the installed SDK or runtime.',
      };
    default:
      return component.version
        ? {
            label: 'Declared version',
            explanation:
              'Taken directly from a version declaration; this does not prove what is installed.',
          }
        : {
            label: 'Version declaration',
            explanation: 'A declaration was found, but no usable version could be identified.',
          };
  }
}
