import { describe, expect, it } from 'vitest';
import { builderFor } from '../src/patterns/creational/builder';

describe('builderFor acronym properties', () => {
  it('preserves URL and HTTPPort rather than decapitalizing their first letter', () => {
    class Connection {
      URL = '';
      HTTPPort = 0;
    }
    const connection = builderFor(Connection)
      .withURL('https://example.test')
      .withHTTPPort(443)
      .build();
    expect(connection.URL).toBe('https://example.test');
    expect(connection.HTTPPort).toBe(443);
    expect(Reflect.has(connection, 'uRL')).toBe(false);
    expect(Reflect.has(connection, 'hTTPPort')).toBe(false);
  });

  it('uses a lexical rule without constructing instances before build', () => {
    let constructions = 0;
    class Configuration {
      name = '';
      x = 0;
      URL = '';
      HTTPPort = 0;
      constructor() {
        constructions += 1;
      }
    }
    const builder = builderFor(Configuration)
      .withName('api')
      .withX(1)
      .withURL('endpoint')
      .withHTTPPort(8080);
    expect(constructions).toBe(0);
    expect(builder.build()).toMatchObject({ name: 'api', x: 1, URL: 'endpoint', HTTPPort: 8080 });
    expect(constructions).toBe(1);
  });

  it('resolves ambiguous capitalized suffixes consistently without reflection', () => {
    class Ambiguous {
      URL = 'uppercase';
      uRL = 'mixed';
      Name = 'uppercase';
      name = 'lowercase';
      HTTPPort = 80;
      hTTPPort = 81;
    }
    const value = builderFor(Ambiguous)
      .withURL('chosen')
      .withName('chosen')
      .withHTTPPort(443)
      .build();
    expect(value).toMatchObject({
      URL: 'chosen',
      uRL: 'mixed',
      Name: 'uppercase',
      name: 'chosen',
      HTTPPort: 443,
      hTTPPort: 81,
    });
  });
});
