'use strict';
const $ = s => document.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = 'weather-favorites-v1';
function favorites(){try{const data=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(data)?data.filter(c=>Number.isFinite(c.latitude)&&Number.isFinite(c.longitude)&&typeof c.name==='string'):[];}catch{return [];}}
function save(list){try{localStorage.setItem(key,JSON.stringify(list));return true;}catch{$('#status').textContent='Браузер не разрешает сохранять избранное. Разрешите локальное хранилище.';return false;}}
const same = (a,b)=>a.latitude===b.latitude&&a.longitude===b.longitude;
function url(c){return 'forecast.html?'+new URLSearchParams({name:c.name,latitude:c.latitude,longitude:c.longitude,region:c.region||''});}
const memory = new Map();
function stored(k){try{return JSON.parse(localStorage.getItem(k));}catch{return memory.get(k);}}
function persist(k,v){memory.set(k,v);try{localStorage.setItem(k,JSON.stringify(v));}catch{}}
function rateError(until){const e=new Error('API ограничил запросы (429). Следующая попытка — после '+new Date(until).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})+'. Ограничение может сохраняться дольше.');e.retryAt=until;return e;}
async function request(url){
 const cacheKey='weather-cache:'+url, cached=stored(cacheKey);
 if(cached && Date.now()-cached.time < 10*60*1000) return cached.data;
 const blockKey='weather-retry:'+new URL(url).hostname;
 const until=stored(blockKey);
 if(Number.isFinite(until)&&until>Date.now())throw rateError(until);
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch(url,{signal:controller.signal});
  if(r.status===429){
   const header=r.headers.get('Retry-After');
   const seconds=header && /^\d+$/.test(header)?Number(header):null;
   const parsed=header?Date.parse(header):NaN;
   const retryAt=seconds!==null?Date.now()+Math.max(1,seconds)*1000:Number.isFinite(parsed)&&parsed>Date.now()?parsed:Date.now()+60000;
   persist(blockKey,retryAt);throw rateError(retryAt);
  }
  if(!r.ok)throw Error('Сервис временно недоступен ('+r.status+'). Попробуйте позже.');
  const d=await r.json();if(d.error)throw Error('Сервис не смог обработать запрос.');
  if(url.includes('/v1/forecast')&&(!d.current||!d.daily?.time?.length))throw Error('Сервис вернул неполные данные.');
  persist(cacheKey,{time:Date.now(),data:d});return d;
 }catch(e){
  if(e.name==='AbortError')throw Error('Сервис не ответил вовремя. Попробуйте ещё раз.');
  if(e instanceof TypeError)throw Error('Не удалось подключиться. Проверьте интернет и повторите попытку.');
  throw e;
 }finally{clearTimeout(timer);}
}

function normalizeWttr(response){
 const d=response.data||response, c=d.current_condition?.[0];
 if(!c||!Array.isArray(d.weather)||!d.weather.length)throw Error('wttr.in вернул неполные данные. Попробуйте позже.');
 const numeric=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
 const code=v=>{
  v=Number(v);
  if(v===113)return 0;if(v===116)return 2;if([119,122].includes(v))return 3;
  if([143,248,260].includes(v))return 45;
  if([200,386,389,392,395].includes(v))return 95;
  if([179,182,185,227,230,281,284,311,314,317,320,323,326,329,332,335,338,350,362,365,368,371,374,377].includes(v))return 73;
  if([176,263,266,293,296,299,302,305,308,353,356,359].includes(v))return 61;
  return -1;
 };
 const daily={time:[],weather_code:[],temperature_2m_max:[],temperature_2m_min:[],precipitation_probability_max:[]};
 for(const day of d.weather){
  const hours=day.hourly||[], noon=hours.find(h=>Number(h.time)===1200)||hours[0]||{};
  daily.time.push(day.date);daily.weather_code.push(code(noon.weatherCode));
  daily.temperature_2m_max.push(numeric(day.maxtempC));daily.temperature_2m_min.push(numeric(day.mintempC));
  const chances=hours.flatMap(h=>[numeric(h.chanceofrain),numeric(h.chanceofsnow)]).filter(Number.isFinite);
  daily.precipitation_probability_max.push(chances.length?Math.max(...chances):null);
 }
 const wind=numeric(c.windspeedKmph);
 return {current:{temperature_2m:numeric(c.temp_C),apparent_temperature:numeric(c.FeelsLikeC),relative_humidity_2m:numeric(c.humidity),wind_speed_10m:wind===null?null:wind/3.6,weather_code:code(c.weatherCode),time:c.localObsDateTime||c.observation_time||'время не указано'},daily,timezone:'время источника wttr.in'};
}

function weather(code){if(code===0)return ['☀️','Ясно'];if([1,2].includes(code))return ['🌤️','Переменная облачность'];if(code===3)return ['☁️','Пасмурно'];if([45,48].includes(code))return ['🌫️','Туман'];if([51,53,55,56,57].includes(code))return ['🌦️','Морось'];if([61,63,65,66,67,80,81,82].includes(code))return ['🌧️','Дождь'];if([71,73,75,77,85,86].includes(code))return ['❄️','Снег'];if([95,96,99].includes(code))return ['⛈️','Гроза'];return ['○','Нет данных'];}
const number = (n,suffix='')=>Number.isFinite(n)?Math.round(n)+suffix:'—';
const popular=[{name:'Москва',latitude:55.75,longitude:37.62,region:'Россия'},{name:'Санкт-Петербург',latitude:59.94,longitude:30.31,region:'Россия'},{name:'Сочи',latitude:43.6,longitude:39.73,region:'Россия'}];
function cityCard(c){return `<article class="card"><div><h2>${esc(c.name)}</h2><span class="muted">${esc(c.region)}</span></div><a class="button secondary" href="${esc(url(c))}">Смотреть прогноз →</a></article>`;}
if(document.body.dataset.page==='search'){
 $('#popular').innerHTML=popular.map(cityCard).join('');
 $('#search').addEventListener('submit',async e=>{e.preventDefault();const term=$('#city').value.trim();if(term.length<2){$('#status').textContent='Введите минимум две буквы.';return;}const b=$('#search button');b.disabled=true;$('#results').replaceChildren();$('#status').textContent='Ищем город…';try{const d=await request('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:term,count:8,language:'ru',format:'json'}));const cities=(d.results||[]).map(c=>({name:c.name,latitude:c.latitude,longitude:c.longitude,region:[c.admin1,c.country].filter(Boolean).join(', ')}));$('#status').textContent=cities.length?'Выберите нужный город:':'Город не найден. Проверьте название или попробуйте латиницей.';$('#results').innerHTML=cities.map(cityCard).join('');}catch(e){$('#status').textContent=e.message;}finally{b.disabled=false;}});
}
if(document.body.dataset.page==='forecast'){
 const p=new URLSearchParams(location.search);const lat=Number(p.get('latitude')),lon=Number(p.get('longitude'));
 const valid=p.has('latitude')&&p.has('longitude')&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
 const city=valid?{name:p.get('name')||'Выбранная точка',latitude:lat,longitude:lon,region:p.get('region')||''}:popular[0];
 $('#city-name').textContent=city.name;$('#region').textContent=city.region;
 const favorite=$('#favorite');function update(){const active=favorites().some(c=>same(c,city));favorite.textContent=active?'★ В избранном · убрать':'☆ В избранное';favorite.setAttribute('aria-pressed',String(active));}update();
 favorite.addEventListener('click',()=>{const list=favorites();if(save(list.some(c=>same(c,city))?list.filter(c=>!same(c,city)):[...list,city]))update();});
 let cooldownTimer;
 async function load(){clearInterval(cooldownTimer);cooldownTimer=null;const retry=$('#refresh');retry.disabled=true;$('#status').textContent='Загружаем прогноз…';try{const data=normalizeWttr(await request('https://wttr.in/'+encodeURIComponent(city.latitude+','+city.longitude)+'?format=j1&lang=ru'));if(!data.current||!data.daily?.time?.length)throw Error('Сервис вернул неполные данные. Повторите запрос.');$('#forecast-heading').textContent='Прогноз на '+data.daily.time.length+' дн.';const c=data.current;$('#temperature').textContent=number(c.temperature_2m,'°');$('#condition').textContent=weather(c.weather_code).join(' ');$('#feels').textContent=number(c.apparent_temperature,'°');$('#wind').textContent=number(c.wind_speed_10m,' м/с');$('#humidity').textContent=number(c.relative_humidity_2m,'%');$('#updated').textContent='Данные на '+c.time.replace('T',' · ')+' · '+data.timezone;$('#days').innerHTML=data.daily.time.map((date,i)=>{const [icon,label]=weather(data.daily.weather_code[i]);const day=new Date(date+'T12:00:00').toLocaleDateString('ru',{weekday:'short',day:'numeric',month:'short'});return `<article class="day"><strong>${esc(day)}</strong><div class="icon" role="img" aria-label="${esc(label)}">${icon}</div><strong>${number(data.daily.temperature_2m_max[i],'°')}</strong> / ${number(data.daily.temperature_2m_min[i],'°')}<small>Осадки ${number(data.daily.precipitation_probability_max[i],'%')}</small></article>`;}).join('');$('#status').textContent='';}catch(e){$('#status').textContent=e.message;
 if($('#temperature').textContent==='—')$('#condition').textContent='Прогноз пока недоступен';
 if(e.retryAt){
  const tick=()=>{const seconds=Math.max(0,Math.ceil((e.retryAt-Date.now())/1000));retry.disabled=seconds>0;retry.textContent=seconds>0?'Повторить через '+seconds+' с':'Повторить запрос';if(!seconds)clearInterval(cooldownTimer);};
  clearInterval(cooldownTimer);tick();cooldownTimer=setInterval(tick,1000);
 }
 }finally{if(!cooldownTimer)retry.disabled=false;}}
 $('#refresh').addEventListener('click',load);load();
}
if(document.body.dataset.page==='favorites'){
 function render(){const list=favorites();$('#saved').innerHTML=list.length?list.map((c,i)=>`<article class="card"><h2>${esc(c.name)}</h2><p class="muted">${esc(c.region)}</p><div class="actions"><a class="button secondary" href="${esc(url(c))}">Прогноз →</a><button data-remove="${i}" aria-label="Удалить ${esc(c.name)}">Удалить</button></div></article>`).join(''):'<div class="empty"><h2>Здесь будут ваши города</h2><p class="muted">Откройте прогноз и нажмите «В избранное», чтобы сохранить город в этом браузере.</p><a class="button" href="index.html">Найти город →</a></div>';}
 $('#saved').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;const list=favorites();list.splice(Number(b.dataset.remove),1);if(save(list))render();});window.addEventListener('storage',render);render();
}
