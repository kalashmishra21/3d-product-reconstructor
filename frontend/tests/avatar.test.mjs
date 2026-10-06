import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAvatar, replaceAvatar, removeAvatar } from '../src/profile/avatar.js'

const USER = '11111111-1111-4111-8111-111111111111'
const OLD = `${USER}/22222222-2222-4222-8222-222222222222.png`
const pngBytes = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])
const png = () => new File([pngBytes], 'unsafe/user-name.png', { type: 'image/png' })

test('avatar validates signature, MIME, dimensions, and its distinct 3 MB ceiling', async () => {
  const valid = await validateAvatar(png(), async () => ({width:256,height:256}))
  assert.deepEqual(valid, {mime:'image/png',extension:'png',width:256,height:256})
  await assert.rejects(validateAvatar(new File([pngBytes],'avatar.jpg',{type:'image/jpeg'}), async()=>({width:256,height:256})), /format/i)
  await assert.rejects(validateAvatar(new File([new Uint8Array(3*1024*1024+1)],'large.png',{type:'image/png'}), async()=>({width:256,height:256})), /3 MB/)
  await assert.rejects(validateAvatar(png(), async()=>({width:5000,height:5000})), /dimensions/i)
  await assert.rejects(validateAvatar(png(), async()=>{throw Error('decode')}), /decode/i)
})

test('replacement uploads first, saves the new private path, then removes the old object', async () => {
  const calls=[]
  const services={
    validateAvatar:async()=>({mime:'image/png',extension:'png',width:256,height:256}),
    makeId:()=> '33333333-3333-4333-8333-333333333333',
    uploadAvatar:async(_user,_id,_file)=>{calls.push('upload');return `${USER}/33333333-3333-4333-8333-333333333333.png`},
    saveProfile:async(_user,patch)=>{calls.push('save');return {avatar_path:patch.avatar_path}},
    removeObjects:async()=>{calls.push('remove')},
    signedImageUrl:async()=>{calls.push('sign');return 'https://example.invalid/signed'},
  }
  const result=await replaceAvatar(USER,png(),OLD,services)
  assert.deepEqual(calls,['upload','save','remove','sign'])
  assert.equal(result.profile.avatar_path,`${USER}/33333333-3333-4333-8333-333333333333.png`)
})

test('failed profile update cleans new upload and leaves old avatar referenced', async () => {
  const calls=[]
  const services={
    validateAvatar:async()=>({mime:'image/png',extension:'png',width:256,height:256}),
    makeId:()=> '33333333-3333-4333-8333-333333333333',
    uploadAvatar:async()=>{calls.push('upload');return `${USER}/33333333-3333-4333-8333-333333333333.png`},
    saveProfile:async()=>{calls.push('save');throw Error('db unavailable')},
    removeObjects:async()=>{calls.push('remove-new')},
  }
  await assert.rejects(replaceAvatar(USER,png(),OLD,services), /db unavailable/)
  assert.deepEqual(calls,['upload','save','remove-new'])
})

test('removal deletes private object before clearing profile path as approved', async () => {
  const calls=[]
  const result=await removeAvatar(USER,OLD,{
    removeObjects:async()=>{calls.push('remove')},
    saveProfile:async(_user,patch)=>{calls.push('save');return {avatar_path:patch.avatar_path}},
  })
  assert.deepEqual(calls,['remove','save'])
  assert.equal(result.avatar_path,null)
})
