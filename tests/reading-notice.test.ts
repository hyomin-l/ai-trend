import {describe,expect,it} from 'vitest';
import {readingNotice} from '@/lib/i18n';
describe('reading failure notices',()=>{
 it.each([
  ['robots-denied','수집을 제한'],['http-429','요청 횟수'],['http-401','인증'],
  ['paywall','유료'],['request-timeout','시간'],['total-timeout','시간'],
  ['google-news-no-public-link','원문 주소'],['unsupported-encoding','압축'],
  ['decompression-failed','압축'],['discussion-page','토론'],['unrelated-body','일치'],
 ])('explains %s in plain language',(reason,text)=>{
  expect(readingNotice(reason,'ko')).toContain(text);
  expect(readingNotice(reason,'en')).not.toContain(reason);
 });
 it('identifies a Google News intermediary restriction without blaming the publisher',()=>{
  expect(readingNotice('robots-denied','ko','https://news.google.com/rss/articles/a')).toContain('Google News 중계');
 });
 it.each(['publisher-http-403','publisher-robots-denied'])('attributes %s to the original site',(reason)=>{
  const notice=readingNotice(reason,'ko','https://news.google.com/rss/articles/a');
  expect(notice).toContain('사이트에서');
  expect(notice).not.toContain('Google News');
 });
 it('uses the generic notice for older or unknown failure metadata',()=>{
  expect(readingNotice(undefined,'ko')).toContain('짧은 설명');
  expect(readingNotice('unknown-internal-error','ko')).not.toContain('unknown-internal-error');
 });
});
