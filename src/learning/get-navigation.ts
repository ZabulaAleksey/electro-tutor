import type {Language} from '../types';
import {publicRoutes} from '../../scripts/public-mvp-contract.mjs';
import {buildLearningNavigation,type PublishedNavigationLesson} from './navigation';

/** Server-only composition of the existing public graph or full published manifest. */
export async function getLearningNavigation(language:Language,mvp:boolean,keepTopics=false) {
  let published:PublishedNavigationLesson[];
  if(mvp) published=publicRoutes.flatMap(path=>{const match=/^\/(ru|uk)\/topics\/([^/]+)\/([^/]+)\/$/.exec(path);return match?[{language:match[1] as Language,section:match[2],slug:match[3]}]:[];});
  else {const {getPublishedLessonManifest}=await import('../content/published-lessons');published=await getPublishedLessonManifest();}
  return buildLearningNavigation(published,language,mvp,import.meta.env.BASE_URL,keepTopics);
}
