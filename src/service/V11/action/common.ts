import {OnlineStatus} from "oicq";
import {OneBotStatus} from "@/onebot";
import {V11} from "@/service/V11";
export class CommonAction{
    /**
     * 获取登录信息
     */
    getLoginInfo(this:V11){
        return {
            user_id:this.client.uin,
            nickname:this.client.nickname
        }
    }
    /**
     * 撤回消息
     * @param message_id {string} 消息id
     */
    deleteMsg(this:V11,message_id:string){
        return this.client.deleteMsg(message_id)
    }

    /**
     * 获取消息
     * @param message_id {string} 消息id
     */
    getMsg(this:V11,message_id:string){
        return this.client.getMsg(message_id)
    }

    /**
     * 获取合并消息
     * @param id {string} 合并id
     */
    getForwardMsg(this:V11,id:string){
        return this.client.getForwardMsg(id)
    }

    /**
     * 获取 Cookies
     * @param domain {string} 域名
     */
    getCookies(this:V11,domain:string){
        return this.client.cookies[domain]
    }

    /**
     * 获取 CSRF Token
     */
    getCsrfToken(this:V11){
        return this.client.getCsrfToken()
    }

    /**
     * 获取 QQ 相关接口凭证
     * @param domain
     */
    getCredentials(this:V11,domain:string){
        return {
            cookies:this.client.cookies[domain],
            csrf_token:this.client.getCsrfToken()
        }
    }

    /**
     * 获取版本信息
     */
    getVersion(this:V11){
        return {
            app_name:'oicq',
            app_version:'2.x',
            protocol_version:'v11'
        }
    }

    /**
     * 重启OneBot实现
     * @param delay {number} 要延迟的毫秒数
     */
    setRestart(this:V11,delay:number){
        return this.emit('restart',delay)
    }
    getStatus(this:V11){
        return {
            online:this.client.status=OnlineStatus.Online,
            good:this.oneBot.status===OneBotStatus.Good
        }
    }
    login(this:V11,password?:string){
        const _this=this
        return new Promise(async resolve=>{
            const timer=setTimeout(()=>{
                resolve('登录超时')
            },5000)
            function receiveQrcode(event){
                _this.client.off('system.login.device',receiveDevice)
                _this.client.off('system.login.slider',receiveSlider)
                _this.client.off('system.online',closeListen)
                clearTimeout(timer)
                resolve(event)
            }
            function receiveDevice(event){
                _this.client.off('system.login.qrcode',receiveQrcode)
                _this.client.off('system.login.slider',receiveSlider)
                _this.client.off('system.online',closeListen)
                clearTimeout(timer)
                resolve(event)
            }
            function receiveError(event){
                clearTimeout(timer)
                resolve(event)
            }
            function receiveSlider(event){
                _this.client.off('system.login.qrcode',receiveQrcode)
                _this.client.off('system.login.device',receiveDevice)
                _this.client.off('system.online',closeListen)
                clearTimeout(timer)
                resolve(event)
            }
            function closeListen(){
                _this.client.off('system.login.slider',receiveSlider)
                _this.client.off('system.login.qrcode',receiveQrcode)
                _this.client.off('system.login.device',receiveDevice)
                clearTimeout(timer)
                resolve('登录成功')
            }
            this.client.once('system.login.qrcode',receiveQrcode)
            this.client.once('system.login.device',receiveDevice)
            this.client.once('system.login.slider',receiveSlider)
            this.client.once('system.login.error',receiveError)
            this.client.once('system.online',closeListen)
            await this.client.login(password).catch(()=>resolve('登录失败'))

        })
    }
    submitSlider(this:V11,ticket:string){
        return this.client.submitSlider(ticket)
    }
    submitSmsCode(this:V11,code:string){
        return this.client.submitSmsCode(code)
    }
    sendSmsCode(this:V11){
        return this.client.sendSmsCode()
    }
}
