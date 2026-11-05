import {curriculum,curriculumLearningResources} from '../curriculum';
import {catalogueItems,catalogueCategoryLabels} from '../catalogue/catalog';
import {localePath} from '../site-path';
import type {Language,LocalizedText} from '../types';
import {publicRoutes,publicPath} from '../../scripts/public-mvp-contract.mjs';

export type LearningStage='textbook'|'examples'|'lab';
export type LearningComponent={status:'implemented'|'not-translated'|'not-implemented';href:string|null;modes:{full:boolean;public:boolean}};
export type LearningReference={id:string;title:LocalizedText;href:string};
export type LearningEntry={id:string;kind:'topic'|'tool';title:LocalizedText;description:LocalizedText;category:LocalizedText;components:Record<LearningStage,LearningComponent>;relatedTools:LearningReference[];variants:LearningReference[]};
export type LearningGroup={id:string;title:LocalizedText;entries:LearningEntry[]};
export type PublishedNavigationLesson={language:Language;section:string;slug:string};
export type LearningTarget={href:string;stage:LearningStage;fallback:boolean};

export function chooseLearningTarget(entry:LearningEntry,stage:LearningStage):LearningTarget|null {
  const component=entry.components[stage];
  if(component.href)return{href:component.href,stage,fallback:false};
  if(stage!=='lab'&&entry.components.lab.href)return{href:entry.components.lab.href,stage:'lab',fallback:true};
  return null;
}

export function buildLearningNavigation(published:readonly PublishedNavigationLesson[],language:Language,mvp=false,base=import.meta.env.BASE_URL):LearningGroup[] {
  const publicPaths=new Set(publicRoutes.map(p=>publicPath(p,base)));
  const component=(href:string|null,status:LearningComponent['status']=href?'implemented':'not-implemented'):LearningComponent=>{
    const allowed=!!href&&publicPaths.has(href.split(/[?#]/)[0]);
    return{status,href:mvp&&!allowed?null:href,modes:{full:!!href,public:allowed}};
  };
  const missing=()=>component(null);
  const toolById=new Map(catalogueItems.map(item=>[item.id,item]));
  const reference=(id:string):LearningReference=>{const item=toolById.get(id);if(!item)throw new Error(`Unknown curriculum tool: ${id}`);return{id:item.id,title:item.title,href:localePath(language,item.href,base)};};
  const groups:LearningGroup[]=curriculum.map(section=>({id:`subject:${section.id}`,title:section.title,entries:section.topics.map(topic=>{
    const binding=curriculumLearningResources[`${section.id}/${topic.id}`];
    const lesson=published.find(item=>item.language===language&&item.section===section.id&&item.slug===topic.lessonSlug);
    const translated=!binding?.stageLanguages||binding.stageLanguages.includes(language);
    const stage=(path:string|undefined)=>component(path&&translated?localePath(language,path,base):null,path&&!translated?'not-translated':undefined);
    const tool=binding?.laboratoryToolId?toolById.get(binding.laboratoryToolId):undefined;
    if(binding?.laboratoryToolId&&!tool)throw new Error(`Unknown laboratory: ${binding.laboratoryToolId}`);
    return{id:`topic:${section.id}/${topic.id}`,kind:'topic',title:topic.title,description:topic.description,category:section.title,components:{
      textbook:component(lesson?localePath(language,`/topics/${section.id}/${lesson.slug}/`,base):null),
      examples:stage(binding?.examplesPath),
      lab:tool?component(tool.available?localePath(language,tool.href,base):null):stage(binding?.laboratoryPath),
    },relatedTools:mvp?[]:(binding?.relatedToolIds||[]).map(reference),variants:[]};
  })}));
  for(const item of catalogueItems) {
    const id=`tools:${item.category}`;let group=groups.find(group=>group.id===id);
    if(!group){group={id,title:catalogueCategoryLabels[item.category],entries:[]};groups.push(group);}
    group.entries.push({id:`tool:${item.id}`,kind:'tool',title:item.title,description:item.description||item.title,category:item.categoryLabel,
      components:{textbook:missing(),examples:missing(),lab:component(item.available?localePath(language,item.href,base):null)},relatedTools:[],
      variants:mvp?[]:(item.variants||[]).map(variant=>({id:variant.id,title:variant.title,href:localePath(language,variant.href,base)})),
    });
  }
  return mvp?groups.map(group=>({...group,entries:group.entries.filter(entry=>Object.values(entry.components).some(part=>part.href))})).filter(group=>group.entries.length):groups;
}
