import Koa from 'koa'
import * as os from 'os'
import {copyFileSync, existsSync, mkdirSync, writeFileSync} from "fs";
import {Logger,getLogger} from "log4js";
import {join,resolve} from 'path'
import {createServer,Server} from "http";
import yaml from 'js-yaml'
import KoaBodyParser from "koa-bodyparser";
import {OneBot} from "@/onebot";
const mime = require('mime-types');
import {deepMerge,deepClone} from "@/utils";
import {Router} from "./router";
import {readFileSync} from "fs";
import {V11} from "@/service/V11";
import {V12} from "@/service/V12";
import {LogLevel, MayBeArray} from "@/types";
import {Platform} from "oicq";
export interface KoaOptions{
    env?: string
    keys?: string[]
    proxy?: boolean
    subdomainOffset?: number
    proxyIpHeader?: string
    maxIpsCount?: number
}
export class App extends Koa{
    public config:App.Config
    readonly httpServer:Server
    public logger:Logger
    static configDir=join(os.homedir(),'.oicq-onebot')
    static configPath=join(this.configDir,'config.yaml')
    oneBots:OneBot<any>[]=[]
    public router:Router
    constructor(config:App.Config={}) {
        super(config);
        this.config=deepMerge(deepClone(App.defaultConfig),config)
        this.logger=getLogger('[oicq-oneBot]')
        this.logger.level=this.config.log_level
        this.router=new Router({prefix:config.path})
        this.use(KoaBodyParser())
            .use(this.router.routes())
            .use(this.router.allowedMethods())
        this.httpServer=createServer(this.callback())
        this.createOneBots()
    }
    getLogger(uin:number|string,version=''){
        const logger= getLogger(`[oicq-oneBot${version}:${uin}]`)
        logger.level=this.config.log_level
        return logger
    }
    private getBots(){
        type OneBotConfig=MayBeArray<OneBot.Config<OneBot.Version>>
        const result:Map<number,OneBotConfig>=new Map<number,OneBotConfig>()
        Object.entries(this.config).forEach(([key,value])=>{
            if(parseInt(key).toString()===key && value && typeof value==='object'){
                result.set(parseInt(key),value)
            }
        })
        return result
    }
    private createOneBots(){
        for(const [uin,config] of this.getBots()){
            this.createOneBot(uin,config)
        }
    }
    public addAccount(uin:number|`${number}`,config:MayBeArray<OneBot.Config<OneBot.Version>>){
        if(typeof uin!=="number")uin=Number(uin)
        if(Number.isNaN(uin)) throw new Error('无效的账号')
        if(this.oneBots.find(oneBot=>oneBot.uin===uin)) throw new Error('账户已存在')
        this.config[uin]=config
        this.createOneBot(uin,config)
        writeFileSync(App.configPath,yaml.dump(this.config))
    }
    public updateAccount(uin:number|`${number}`,config:MayBeArray<OneBot.Config<OneBot.Version>>){
        if(typeof uin!=="number")uin=Number(uin)
        if(Number.isNaN(uin)) throw new Error('无效的账号')
        const oneBot=this.oneBots.find(oneBot=>oneBot.uin===uin)
        if(!oneBot) return this.addAccount(uin,config)
        const newConfig=deepMerge(this.config[uin],config)
        this.removeAccount(uin)
        this.addAccount(uin,newConfig)
    }
    public removeAccount(uin:number|`${number}`){
        if(typeof uin!=="number")uin=Number(uin)
        if(Number.isNaN(uin)) throw new Error('无效的账号')
        const currentIdx=this.oneBots.findIndex(oneBot=>oneBot.uin===uin)

        if(currentIdx<0) throw new Error('账户不存在')
        const oneBot=this.oneBots[currentIdx]
        oneBot.stop()
        delete this.config[uin]
        this.oneBots.splice(currentIdx,1)
        writeFileSync(App.configPath,yaml.dump(this.config))
    }
    public createOneBot(uin:number,config:MayBeArray<OneBot.Config<OneBot.Version>>){
        const oneBot=new OneBot(this,uin,config)
        this.oneBots.push(oneBot)
        return oneBot
    }
    start(){
        for(const oneBot of this.oneBots){
            oneBot.start()
        }
        this.httpServer.listen(this.config.port)
        this.router.get('/list',(ctx)=>{
            ctx.body=this.oneBots.map(bot=>{
                return {
                    uin:bot.uin,
                    config:bot.config,
                    urls:bot.config.map(c=>`/${c.version}/${bot.uin}`)
                }
            })
        })
        this.router.get('/qrcode',(ctx)=>{
            const {uin}=ctx.query
            const uinUrl=join(App.configDir,'data',uin as string)
            if(!existsSync(uinUrl)){
                return ctx.res.writeHead(400).end('未登录')
            }
            const qrcodePath=join(App.configDir,'data',uin as string,'qrcode.png')
            let file = null;
            try {
                file =readFileSync(qrcodePath); //读取文件
            } catch (error) {
                return ctx.res.writeHead(404).end(error.message)
            }
            let mimeType = mime.lookup(qrcodePath); //读取图片文件类型
            ctx.set('content-type', mimeType); //设置返回类型
            ctx.body = file; //返回图片
        })
        this.router.get('/detail',(ctx)=>{
            let {uin}=ctx.request.query
            const oneBot=this.oneBots.find(bot=>bot.uin===Number(uin))
            ctx.body={
                uin,
                config:oneBot.config,
                urls:oneBot.config.map(c=>`/${uin}/${c.version}`)
            }
        })
        this.router.post('/add',(ctx,next)=>{
            const {uin,config}=ctx.request.body
            try{
                this.addAccount(uin,config)
                ctx.body=`添加成功`
            }catch (e){
                ctx.body=e.message
            }
        })
        this.router.get('/edit',(ctx,next)=>{
            const {uin,config}=ctx.request.body
            try{
                this.updateAccount(Number(uin),config)
                ctx.body=`修改成功`
            }catch (e){
                ctx.body=e.message
            }
        })
        this.router.get('/remove',(ctx,next)=>{
            const {uin}=ctx.request.query
            try{
                this.removeAccount(Number(uin))
                ctx.body=`移除成功`
            }catch (e){
                console.log(e)
                ctx.body=e.message
            }
        })
        this.logger.mark(`server listen at http://0.0.0.0:${this.config.port}/${this.config.path?this.config.path:''}`)
    }
}
export function createApp<V extends OneBot.Version>(config:App.Config|string='config.yaml'){
    if(typeof config==='string'){
        if(!existsSync(App.configDir)){
            mkdirSync(App.configDir)
        }
        App.configPath=join(App.configDir,config)
        if(!existsSync(App.configPath)){
            copyFileSync(resolve(__dirname,'../config.sample.yaml'),App.configPath)
            console.log('未找到对应配置文件，已自动生成默认配置文件，请修改配置文件后重新启动')
            console.log(`配置文件在:  ${App.configPath}`)
            process.exit()
        }
        config=yaml.load(readFileSync(App.configPath, 'utf8')) as App.Config
    }
    return new App(config)
}
export function defineConfig(config:App.Config){
    return config
}
export namespace App{
    export type Config={
        port?:number
        path?:string
        log_level?:LogLevel
        platform?:Platform
        general?:{
            V11?:V11.Config
            V12?:V12.Config
        }
    } & KoaOptions & Record<`${number}`, MayBeArray<OneBot.Config<OneBot.Version>>>
    export const defaultConfig:Config={
        port:6727,
        platform: 5,
        general:{
          V11:V11.defaultConfig,
          V12:V12.defaultConfig
        },
        log_level:'info',
    }
}
