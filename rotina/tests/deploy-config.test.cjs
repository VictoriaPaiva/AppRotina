/* eslint-disable @typescript-eslint/no-require-imports -- Deployment URL and production guard regression. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/load-typescript.cjs');
const {siteMetadataBase}=load('lib/site-metadata.ts');
const keys=['NEXT_PUBLIC_SITE_URL','VERCEL_PROJECT_PRODUCTION_URL','VERCEL_URL','VERCEL_ENV'];
function environment(values,run){const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));try{for(const key of keys){if(values[key]===undefined)delete process.env[key];else process.env[key]=values[key];}return run();}finally{for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}}
test('metadata uses explicit canonical origin then production host then deployment host, without a localhost fallback',()=>{
  environment({},()=>assert.equal(siteMetadataBase(),undefined));
  environment({VERCEL_URL:'preview.example.test'},()=>assert.equal(siteMetadataBase().origin,'https://preview.example.test'));
  environment({VERCEL_PROJECT_PRODUCTION_URL:'official.example.test',VERCEL_URL:'unique.example.test'},()=>assert.equal(siteMetadataBase().origin,'https://official.example.test'));
  environment({NEXT_PUBLIC_SITE_URL:'https://canonical.example.test',VERCEL_URL:'unique.example.test'},()=>assert.equal(siteMetadataBase().origin,'https://canonical.example.test'));
});
test('production metadata rejects loopback, non-HTTPS, credentials and arbitrary paths without exposing configuration values',()=>{
  environment({VERCEL_ENV:'production'},()=>assert.throws(()=>siteMetadataBase(),/origem pública válida/));
  for(const url of ['http://localhost:3000','https://127.0.0.1','http://official.example.test','https://user:private@official.example.test','https://official.example.test/path','https://official.example.test?token=private','not-url']) {
    environment({VERCEL_ENV:'production',NEXT_PUBLIC_SITE_URL:url},()=>assert.throws(()=>siteMetadataBase(),e=>!e.message.includes('private')&&e.message==='Configure uma origem pública válida para os metadados do site.'));
  }
  environment({NEXT_PUBLIC_SITE_URL:'http://localhost:3000'},()=>assert.equal(siteMetadataBase().origin,'http://localhost:3000'));
});
