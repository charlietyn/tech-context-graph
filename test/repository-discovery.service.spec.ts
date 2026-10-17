import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { RepositoryDiscoveryService } from '../src/services/repository-discovery.service';
import { TechnologyCatalogService } from '../src/services/technology-catalog.service';
import { WorkspaceConfigService } from '../src/services/config.service';
import { KitPathService } from '../src/services/kit-path.service';

describe('RepositoryDiscoveryService', () => {
  function createService(): RepositoryDiscoveryService {
    process.env.TCG_KIT_ROOT = resolve(__dirname, '..');
    const config = new WorkspaceConfigService();
    const catalog = new TechnologyCatalogService(new KitPathService());
    return new RepositoryDiscoveryService(catalog, config);
  }

  it.each(['technology', 'application'])('keeps unknown %s repositories under technologies after assigning unique keys', (role) => {
    const root = mkdtempSync(join(tmpdir(), 'tcg-unknown-output-'));
    const source = join(root, 'sources');
    for (const folder of ['first/go', 'second/go', 'driver-js']) {
      mkdirSync(join(source, folder, '.git'), { recursive: true });
    }
    const service = createService();
    const report = service.discover(root, source, { role });
    expect(report.candidates).toHaveLength(3);
    expect(new Set(report.candidates.map((item) => item.key)).size).toBe(3);
    for (const item of report.candidates) {
      expect(item.technology).toBe('unknown');
      expect(item.graph_output).toBe(`./tech-graphify-out/technologies/${item.key}`);
    }
    expect(service.detectRepository(root, join(source, 'driver-js'))?.graph_output)
      .toBe('./tech-graphify-out/technologies/driver-js');
  });

  it('detects NestJS and Laravel inside an unstructured global folder', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-discovery-'));
    const workspace = join(base, 'workspace');
    const tech = join(base, 'Tech');
    const nest = join(tech, 'Backend', 'NestJS', 'nest');
    const laravel = join(tech, 'Backend', 'Laravel', '13');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(nest, '.git'), { recursive: true });
    mkdirSync(join(laravel, '.git'), { recursive: true });
    writeFileSync(join(nest, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } }));
    writeFileSync(join(nest, 'nest-cli.json'), '{}');
    writeFileSync(join(laravel, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^13.0' } }));
    writeFileSync(join(laravel, 'artisan'), '#!/usr/bin/env php');

    const report = createService().discover(workspace, tech, { role: 'technology' });
    expect(report.candidates.map((item) => item.technology).sort()).toEqual(['laravel', 'nestjs']);
    expect(report.candidates.every((item) => item.category === 'backend')).toBe(true);
    expect(report.candidates.find((item) => item.technology === 'nestjs')?.key).toBe('nestjs');
    expect(report.candidates.find((item) => item.technology === 'laravel')?.key).toBe('laravel-13');
  });

  it('writes tech-context-graph.yaml only when apply is used', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-apply-'));
    const workspace = join(base, 'workspace');
    const project = join(base, 'Tech', 'Backend', 'NestJS', 'nest');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(project, { recursive: true });
    writeFileSync(join(workspace, 'tech-context-graph.yaml'), 'version: 4\nprojects: {}\n');
    writeFileSync(join(project, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } }));
    createService().discover(workspace, join(base, 'Tech'), { role: 'technology', apply: true });
    const config = parse(readFileSync(join(workspace, 'tech-context-graph.yaml'), 'utf8')) as any;
    expect(config.projects.nestjs.technology).toBe('nestjs');
    expect(config.projects.nestjs.graph_output).toBe('./tech-graphify-out/technologies/nestjs/nestjs');
  });

  it('recognizes a framework source repository by its package name', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-framework-source-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'Tech', 'Backend', 'NestJS', 'nest');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    writeFileSync(join(source, 'package.json'), JSON.stringify({
      name: '@nestjs/core',
      version: '11.2.0',
      dependencies: { rxjs: '^7.0.0' },
    }));

    const report = createService().discover(workspace, join(base, 'Tech'), { role: 'technology' });
    const candidate = report.candidates.find((item) => item.path === resolve(source));

    expect(candidate?.technology).toBe('nestjs');
    expect(candidate?.technology_label).toBe('NestJS');
    expect(candidate?.artifact_kind).toBe('core');
    expect(candidate?.technology_version).toBe('11');
    expect(candidate?.key).toBe('nestjs-core-11');
    expect(candidate?.markers).toContain('package-name:@nestjs/core');
  });

  it('recognizes the official Next.js monorepo instead of classifying it as generic React', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-next-source-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'Tech', 'FrontEnd', 'NextJS', 'next.js');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    writeFileSync(join(source, 'package.json'), JSON.stringify({
      name: 'nextjs-project',
      dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    }));

    const report = createService().discover(workspace, join(base, 'Tech'), { role: 'technology' });
    const candidate = report.candidates.find((item) => item.path === resolve(source));

    expect(candidate?.technology).toBe('nextjs');
    expect(candidate?.technology_label).toBe('Next.js');
    expect(candidate?.markers).toContain('package-name:nextjs-project');
  });

  it('recognizes Vue core, Router and Pinia source repositories as one technology', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-vue-family-'));
    const workspace = join(base, 'workspace');
    const family = join(base, 'Tech', 'FrontEnd', 'Vue');
    const repositories = [
      { folder: 'core', pkg: { private: true, devDependencies: { '@vue/consolidate': '1.0.0' } } },
      { folder: 'router', pkg: { name: '@vue/router-root', private: true } },
      { folder: 'pinia', pkg: { name: '@pinia/root', private: true } },
    ];
    mkdirSync(workspace, { recursive: true });
    for (const repository of repositories) {
      const path = join(family, repository.folder);
      mkdirSync(join(path, '.git'), { recursive: true });
      writeFileSync(join(path, 'package.json'), JSON.stringify(repository.pkg));
    }

    const report = createService().discover(workspace, family, { role: 'technology' });

    expect(report.candidates).toHaveLength(3);
    expect(report.candidates.every((item) => item.technology === 'vue')).toBe(true);
    expect(report.candidates.map((item) => item.key).sort()).toEqual(['core', 'router', 'vue-pinia']);
  });

  it('nests the members of a composite technology under technologies/<tech>/<member>', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-vue-nesting-'));
    const workspace = join(base, 'workspace');
    const family = join(base, 'Tech', 'FrontEnd', 'Vue', 'Vue');
    const repositories = [
      { folder: 'core', pkg: { private: true, devDependencies: { '@vue/consolidate': '1.0.0' } } },
      { folder: 'router', pkg: { name: '@vue/router-root', private: true } },
      { folder: 'pinia', pkg: { name: '@pinia/root', private: true } },
    ];
    mkdirSync(workspace, { recursive: true });
    for (const repository of repositories) {
      const path = join(family, repository.folder);
      mkdirSync(join(path, '.git'), { recursive: true });
      writeFileSync(join(path, 'package.json'), JSON.stringify(repository.pkg));
    }

    const report = createService().discover(workspace, family, { role: 'technology' });

    expect(report.candidates.map((item) => item.graph_output).sort()).toEqual([
      './tech-graphify-out/technologies/vue/core',
      './tech-graphify-out/technologies/vue/router',
      './tech-graphify-out/technologies/vue/vue-pinia',
    ]);
    expect(report.candidates.every((item) => item.markers.includes('member_of:vue'))).toBe(true);
  });

  it('does not group a container whose subfolders are different technologies', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-heterogeneous-'));
    const workspace = join(base, 'workspace');
    const container = join(base, 'Tech', 'Mixed');
    const laravel = join(container, 'shop');
    const nest = join(container, 'api');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(laravel, '.git'), { recursive: true });
    mkdirSync(join(nest, '.git'), { recursive: true });
    writeFileSync(join(laravel, 'composer.json'), JSON.stringify({ require: { 'laravel/framework': '^13.0' } }));
    writeFileSync(join(laravel, 'artisan'), '#!/usr/bin/env php');
    writeFileSync(join(nest, 'package.json'), JSON.stringify({ dependencies: { '@nestjs/core': '^11.0.0' } }));
    writeFileSync(join(nest, 'nest-cli.json'), '{}');

    const report = createService().discover(workspace, container, { role: 'technology' });

    expect(report.candidates.map((item) => item.technology).sort()).toEqual(['laravel', 'nestjs']);
    expect(report.candidates.every((item) => !item.markers.some((marker) => marker.startsWith('member_of:')))).toBe(true);
    // Each stays a flat, independent top-level repository — never nested under a shared technology.
    expect(report.candidates.map((item) => item.graph_output).sort()).toEqual([
      './tech-graphify-out/technologies/laravel/laravel-shop',
      './tech-graphify-out/technologies/nestjs/nestjs-api',
    ]);
  });

  it('registers a Laravel library even when no Laravel core repository is present', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-laravel-library-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'Libraries', 'agent-protocol');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    writeFileSync(join(source, 'composer.json'), JSON.stringify({
      name: 'ronu/laravel-agent-protocol',
      version: '0.2.1',
      type: 'library',
      require: {
        'illuminate/contracts': '^11.0|^12.0',
        'illuminate/support': '^11.0|^12.0',
      },
      extra: { laravel: { providers: ['Ronu\\Provider'] } },
    }));

    const candidate = createService().discover(workspace, source, { role: 'technology' }).candidates[0];
    expect(candidate).toMatchObject({
      key: 'ronu-laravel-agent-protocol',
      role: 'library',
      category: 'library',
      technology: 'laravel',
      artifact_kind: 'library',
      package_ecosystem: 'composer',
      package_name: 'ronu/laravel-agent-protocol',
      package_version: '0.2.1',
      technology_constraints: ['11', '12'],
      graph_output: './tech-graphify-out/technologies/laravel/ronu-laravel-agent-protocol',
    });
  });

  it('names an official Laravel base as laravel-core-<major>', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-laravel-core-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'Laravel');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    writeFileSync(join(source, 'composer.json'), JSON.stringify({
      name: 'laravel/laravel',
      type: 'project',
      require: { 'laravel/framework': '^13.0' },
    }));
    writeFileSync(join(source, 'artisan'), '#!/usr/bin/env php');

    const candidate = createService().discover(workspace, source, { role: 'technology' }).candidates[0];
    expect(candidate).toMatchObject({
      key: 'laravel-core-13',
      role: 'technology',
      artifact_kind: 'core',
      technology: 'laravel',
      technology_version: '13',
      graph_output: './tech-graphify-out/technologies/laravel/laravel-core-13',
    });
  });

  it('classifies Blaze-Persistence from Maven coordinates as a Spring Boot library', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-blaze-persistence-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'blaze-persistence');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    mkdirSync(join(source, 'parent'), { recursive: true });
    writeFileSync(join(source, 'pom.xml'), `
      <project>
        <groupId>com.blazebit</groupId>
        <artifactId>blaze-persistence</artifactId>
        <version>1.6.19-SNAPSHOT</version>
        <packaging>pom</packaging>
      </project>`);
    writeFileSync(join(source, 'parent', 'pom.xml'), `
      <project><properties>
        <version.spring-data-2.7-spring-boot>2.7.12</version.spring-data-2.7-spring-boot>
        <version.spring-data-3.5-spring-boot>3.5.16</version.spring-data-3.5-spring-boot>
        <version.spring-data-4.0-spring-boot>4.0.7</version.spring-data-4.0-spring-boot>
      </properties></project>`);

    const candidate = createService().detectRepository(workspace, source);
    expect(candidate).toMatchObject({
      key: 'blaze-persistence',
      role: 'library',
      category: 'library',
      technology: 'spring-boot',
      artifact_kind: 'library',
      package_ecosystem: 'maven',
      package_name: 'com.blazebit:blaze-persistence',
      package_version: '1.6.19-SNAPSHOT',
      technology_constraints: ['2', '3', '4'],
      graph_output: './tech-graphify-out/technologies/spring-boot/blaze-persistence',
    });
    expect(candidate?.classification_evidence).toContain('library-package:com.blazebit:blaze-persistence');
  });

  it('names a Gradle technology source as <technology>-core-<version>', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-spring-core-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'spring-boot');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    writeFileSync(join(source, 'settings.gradle'), "rootProject.name = 'spring-boot'");
    writeFileSync(join(source, 'build.gradle'), "plugins { id 'java-library' }");
    writeFileSync(join(source, 'gradle.properties'), 'version=3.5.2\ngroup=org.springframework.boot\n');

    expect(createService().detectRepository(workspace, source)).toMatchObject({
      key: 'spring-boot-core-3',
      role: 'technology',
      technology: 'spring-boot',
      artifact_kind: 'core',
      package_ecosystem: 'gradle',
      package_version: '3.5.2',
      technology_version: '3',
      graph_output: './tech-graphify-out/technologies/spring-boot/spring-boot-core-3',
    });
  });

  it('recognizes the official PrimeVue monorepo and assigns its noise profile', () => {
    const base = mkdtempSync(join(tmpdir(), 'tcg-primevue-'));
    const workspace = join(base, 'workspace');
    const source = join(base, 'Tech', 'PrimeVue', 'primevue');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(join(source, '.git'), { recursive: true });
    writeFileSync(join(source, 'package.json'), JSON.stringify({ name: '@primevue/monorepo', private: true }));

    const report = createService().discover(workspace, join(base, 'Tech'), { role: 'technology' });
    const candidate = report.candidates.find((item) => item.path === resolve(source));

    expect(candidate?.technology).toBe('primevue');
    expect(candidate?.technology_label).toBe('PrimeVue');
    expect(candidate?.ignore_profile).toBe('primevue');
  });
});
