import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { selectTechnologyCore } from '../src/services/technology-query.service';
import { StoredRepository } from '../src/models/repository-state';

const fixture = JSON.parse(readFileSync(resolve(__dirname,
  'fixtures/contracts/technology-context/v1/technology-version-matrix.json'), 'utf8'));

describe('Version identity shared with AG and PCX', () => {
  const candidates = [...fixture.cores, ...fixture.libraries] as StoredRepository[];
  it.each(fixture.expectations)('selects one compatible explicit core for $request', ({ request, expectedCore, expectedError }) => {
    if (expectedError) {
      expect(() => selectTechnologyCore(candidates, 'nestjs', request)).toThrow();
    } else expect(selectTechnologyCore(candidates, 'nestjs', request).id).toBe(expectedCore);
  });

  it('refuses a library-only match or ambiguous duplicate cores', () => {
    expect(() => selectTechnologyCore(fixture.libraries as StoredRepository[], 'nestjs', '10')).toThrow();
    expect(() => selectTechnologyCore([...candidates, { ...fixture.cores[0], id: 'forged-duplicate' }], 'nestjs', '10'))
      .toThrow('Several approved cores');
  });

  it('does not confuse packageVersion, frameworkVersion and Graphify version', () => {
    for (const library of fixture.libraries) {
      expect(library.packageVersion).toBeTruthy();
      expect(library.technologyVersion).toBeUndefined();
      expect(library.technologyConstraints).toHaveLength(1);
    }
    expect(fixture.cores[0].technologyVersion).not.toEqual(fixture.libraries[0].packageVersion);
  });
});
