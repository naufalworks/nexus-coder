/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Type declarations for jest-axe
 */
declare module 'jest-axe' {
  export interface AxeResults {
    violations: any[];
    passes: any[];
    incomplete: any[];
    inapplicable: any[];
  }
  
  export function axe(
    element: Element | Document,
    options?: any
  ): Promise<AxeResults>;
  
  export const toHaveNoViolations: any;
}
