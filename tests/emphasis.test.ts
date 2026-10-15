import { describe, expect, it } from 'vitest';
import { emphasisRanges } from '../components/Glossary';

describe('summary emphasis', () => {
  it('keeps glossary terms emphasized alongside key phrases', () => {
    const text='병합 3만건을 처리하려고 Scion으로 모노레포를 옮겼습니다.';
    const marks=emphasisRanges(text,['병합 3만건'],['Scion','모노레포']).map(r=>text.slice(r.start,r.end));
    expect(marks).toEqual(['병합 3만건','Scion','모노레포']);
  });
  it('merges overlapping phrase and term ranges without losing either', () => {
    const text='Scion으로 모노레포를 이전했습니다.';
    expect(emphasisRanges(text,['으로 모노레포를'],['Scion으로'])).toEqual([{start:0,end:'Scion으로 모노레포를'.length}]);
  });
  it('does not highlight a glossary acronym inside a different word', () => {
    const text='storage와 RAG를 비교합니다. scion을 사용합니다.';
    const marks=emphasisRanges(text,[],['RAG','Scion']).map(r=>text.slice(r.start,r.end));
    expect(marks).toEqual(['RAG','scion']);
  });
  it('marks a contained term only once and ignores absent phrases', () => {
    const text='Scion 기반 코드 관리';
    expect(emphasisRanges(text,['Scion 기반','없는 구절'],['Scion'])).toEqual([{start:0,end:8}]);
  });
});
