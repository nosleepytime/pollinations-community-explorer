import { test } from 'node:test';
import assert from 'node:assert/strict';
import {getCategory,getFreeStatus,normalizeModel,filterModels} from '../api/models.js';
const models=[
{id:'community/Catniti/agnes-3.0-flash',category:'text',pricing:{promptTextPrice:0,completionTextPrice:0},capabilities:{vision:true,tools:true},per_user_rpm:10},
{id:'community/user/paid',category:'image',pricing:{promptTextPrice:0.2}},
{id:'community/user/unknown',category:'audio'},
{id:'openai/gpt',category:'text',pricing:{promptTextPrice:0}}
];
test('zero-priced community models count as free',()=>assert.equal(getFreeStatus(models[0]),'free'));
test('missing price is explicitly unknown',()=>assert.equal(getFreeStatus(models[2]),'unknown'));
test('paid models are excluded when freeOnly=true',()=>assert.deepEqual(filterModels(models,new URLSearchParams('freeOnly=true')).map(x=>x.id),['community/Catniti/agnes-3.0-flash','community/user/unknown']));
test('filters and search work',()=>assert.equal(filterModels(models,new URLSearchParams('category=text&capability=vision&q=Catniti')).length,1));
test('raw metadata is preserved',()=>assert.equal(normalizeModel(models[0]).raw.per_user_rpm,10));
test('categorizes video',()=>assert.equal(getCategory({category:'video'}),'video'));
