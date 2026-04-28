/**
 * Unit tests for Dependency Health Checker
 * 
 * Tests the core functionality of the dependency health analyzer including
 * outdated package detection, security vulnerability scanning, unused
 * dependency identification, and misplaced dependency detection.
 * 
 * @module audit/dependency/health.test
 */

import {
  checkOutdatedPackages,
  checkSecurityVulnerabilities,
  identifyUnusedDependencies,
  identifyMisplacedDependencies,
  generateDependencyHealthReport,
  formatDependencyHealthReport,
  type DependencyStatus,
  type SecurityVulnerability,
  type DependencyHealthReport,
} from './health';

describe('Dependency Health Checker', () => {
  describe('checkOutdatedPackages', () => {
    it('should return an array of dependency status objects', () => {
      const result = checkOutdatedPackages();
      
      expect(Array.isArray(result)).toBe(true);
      
      // If there are outdated packages, verify structure
      if (result.length > 0) {
        const first = result[0];
        expect(first).toHaveProperty('package');
        expect(first).toHaveProperty('current');
        expect(first).toHaveProperty('wanted');
        expect(first).toHaveProperty('latest');
        expect(first).toHaveProperty('type');
        expect(first).toHaveProperty('isOutdated');
        expect(typeof first.package).toBe('string');
        expect(typeof first.current).toBe('string');
        expect(typeof first.isOutdated).toBe('boolean');
      }
    });

    it('should identify packages where current !== latest', () => {
      const result = checkOutdatedPackages();
      
      for (const pkg of result) {
        if (pkg.isOutdated) {
          expect(pkg.current).not.toBe(pkg.latest);
        }
      }
    });
  });

  describe('checkSecurityVulnerabilities', () => {
    it('should return an array of security vulnerability objects', () => {
      const result = checkSecurityVulnerabilities();
      
      expect(Array.isArray(result)).toBe(true);
      
      // If there are vulnerabilities, verify structure
      if (result.length > 0) {
        const first = result[0];
        expect(first).toHaveProperty('package');
        expect(first).toHaveProperty('severity');
        expect(first).toHaveProperty('title');
        expect(first).toHaveProperty('recommendation');
        expect(['critical', 'high', 'medium', 'low']).toContain(first.severity);
      }
    });

    it('should only include high and critical vulnerabilities', () => {
      const result = checkSecurityVulnerabilities();
      
      for (const vuln of result) {
        expect(['critical', 'high']).toContain(vuln.severity);
      }
    });
  });

  describe('identifyUnusedDependencies', () => {
    it('should return an array of package names', () => {
      const result = identifyUnusedDependencies();
      
      expect(Array.isArray(result)).toBe(true);
      
      for (const pkg of result) {
        expect(typeof pkg).toBe('string');
      }
    });

    it('should not include packages that are imported in src/', () => {
      const result = identifyUnusedDependencies();
      
      // These packages are definitely used in the codebase
      const knownUsedPackages = ['winston', 'simple-git', 'openai'];
      
      for (const usedPkg of knownUsedPackages) {
        expect(result).not.toContain(usedPkg);
      }
    });
  });

  describe('identifyMisplacedDependencies', () => {
    it('should return an array of misplacement objects', () => {
      const result = identifyMisplacedDependencies();
      
      expect(Array.isArray(result)).toBe(true);
      
      if (result.length > 0) {
        const first = result[0];
        expect(first).toHaveProperty('package');
        expect(first).toHaveProperty('currentLocation');
        expect(first).toHaveProperty('recommendedLocation');
        expect(first).toHaveProperty('reason');
        expect(['dependencies', 'devDependencies']).toContain(first.currentLocation);
        expect(['dependencies', 'devDependencies']).toContain(first.recommendedLocation);
      }
    });

    it('should recommend moving devDependencies used in src/ to dependencies', () => {
      const result = identifyMisplacedDependencies();
      
      for (const mis of result) {
        if (mis.currentLocation === 'devDependencies') {
          expect(mis.recommendedLocation).toBe('dependencies');
          expect(mis.reason).toContain('src/');
        }
      }
    });
  });

  describe('generateDependencyHealthReport', () => {
    it('should generate a comprehensive health report', () => {
      const report = generateDependencyHealthReport();
      
      expect(report).toHaveProperty('outdated');
      expect(report).toHaveProperty('vulnerabilities');
      expect(report).toHaveProperty('unused');
      expect(report).toHaveProperty('misplaced');
      expect(report).toHaveProperty('healthStatus');
      expect(report).toHaveProperty('summary');
      
      expect(Array.isArray(report.outdated)).toBe(true);
      expect(Array.isArray(report.vulnerabilities)).toBe(true);
      expect(Array.isArray(report.unused)).toBe(true);
      expect(Array.isArray(report.misplaced)).toBe(true);
      
      expect(['healthy', 'warning', 'critical']).toContain(report.healthStatus);
    });

    it('should have accurate summary counts', () => {
      const report = generateDependencyHealthReport();
      
      expect(report.summary.outdatedCount).toBe(report.outdated.length);
      expect(report.summary.vulnerabilityCount).toBe(report.vulnerabilities.length);
      expect(report.summary.unusedCount).toBe(report.unused.length);
      expect(report.summary.misplacedCount).toBe(report.misplaced.length);
      expect(report.summary.totalDependencies).toBeGreaterThan(0);
    });

    it('should set health status to critical when critical vulnerabilities exist', () => {
      const report = generateDependencyHealthReport();
      
      const hasCriticalVuln = report.vulnerabilities.some(v => v.severity === 'critical');
      
      if (hasCriticalVuln) {
        expect(report.healthStatus).toBe('critical');
      }
    });

    it('should set health status to warning when high vulnerabilities or many outdated packages exist', () => {
      const report = generateDependencyHealthReport();
      
      const hasHighVuln = report.vulnerabilities.some(v => v.severity === 'high');
      const hasManyOutdated = report.outdated.length > 5;
      const hasMisplaced = report.misplaced.length > 0;
      
      if ((hasHighVuln || hasManyOutdated || hasMisplaced) && report.healthStatus !== 'critical') {
        expect(report.healthStatus).toBe('warning');
      }
    });
  });

  describe('formatDependencyHealthReport', () => {
    it('should format a report as a readable string', () => {
      const report = generateDependencyHealthReport();
      const formatted = formatDependencyHealthReport(report);
      
      expect(typeof formatted).toBe('string');
      expect(formatted).toContain('Dependency Health Report');
      expect(formatted).toContain('Overall Health:');
      expect(formatted).toContain('Summary:');
    });

    it('should include outdated packages section when present', () => {
      const report = generateDependencyHealthReport();
      const formatted = formatDependencyHealthReport(report);
      
      if (report.outdated.length > 0) {
        expect(formatted).toContain('Outdated Packages:');
        expect(formatted).toContain(report.outdated[0].package);
      }
    });

    it('should include vulnerabilities section when present', () => {
      const report = generateDependencyHealthReport();
      const formatted = formatDependencyHealthReport(report);
      
      if (report.vulnerabilities.length > 0) {
        expect(formatted).toContain('Security Vulnerabilities:');
        expect(formatted).toContain(report.vulnerabilities[0].package);
      }
    });

    it('should include unused dependencies section when present', () => {
      const report = generateDependencyHealthReport();
      const formatted = formatDependencyHealthReport(report);
      
      if (report.unused.length > 0) {
        expect(formatted).toContain('Unused Dependencies:');
        expect(formatted).toContain(report.unused[0]);
      }
    });

    it('should include misplaced dependencies section when present', () => {
      const report = generateDependencyHealthReport();
      const formatted = formatDependencyHealthReport(report);
      
      if (report.misplaced.length > 0) {
        expect(formatted).toContain('Misplaced Dependencies:');
        expect(formatted).toContain(report.misplaced[0].package);
      }
    });

    it('should show healthy message when all checks pass', () => {
      // Create a mock healthy report
      const healthyReport: DependencyHealthReport = {
        outdated: [],
        vulnerabilities: [],
        unused: [],
        misplaced: [],
        healthStatus: 'healthy',
        summary: {
          totalDependencies: 42,
          outdatedCount: 0,
          vulnerabilityCount: 0,
          unusedCount: 0,
          misplacedCount: 0,
        },
      };
      
      const formatted = formatDependencyHealthReport(healthyReport);
      
      expect(formatted).toContain('All dependencies are healthy!');
    });
  });
});
