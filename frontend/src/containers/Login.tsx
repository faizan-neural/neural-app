import { 
    LockOutlined,
    GithubOutlined,
    GoogleOutlined, 
} from '@ant-design/icons'
import { Button, Card, Collapse, Input, Radio, Row, Select } from 'antd'
import React, { ReactComponentElement } from 'react'
import { Redirect, RouteComponentProps } from 'react-router'
import ApiManager from '../api/ApiManager'
import ErrorFactory from '../utils/ErrorFactory'
import {
    currentLanguageOption,
    languagesOptions,
    localize,
} from '../utils/Language'
import StorageHelper from '../utils/StorageHelper'
import Toaster from '../utils/Toaster'
import Utils from '../utils/Utils'
import ApiComponent from './global/ApiComponent'

const NO_SESSION = 1
const SESSION_STORAGE = 2
const LOCAL_STORAGE = 3

export default class Login extends ApiComponent<RouteComponentProps<any>, any> {
    constructor(props: any) {
        super(props)
        this.state = {
            loginOption: NO_SESSION,
            hasOtp: false,
        }
    }

    componentDidMount(): void {
        if (super.componentDidMount) {
            super.componentDidMount()
        }
        Utils.deleteAllCookies()
    }

    onLoginRequested(password: string, otp: string) {
        const self = this
        //self.props.history.push('/dashboard')

        //login using original OTP login, probably disconnect this
        this.apiManager
            .getAuthToken(password, otp)
            .then(function () {
                if (self.state.loginOption === SESSION_STORAGE) {
                    StorageHelper.setAuthKeyInSessionStorage(
                        ApiManager.getAuthTokenString()
                    )
                } else if (self.state.loginOption === LOCAL_STORAGE) {
                    StorageHelper.setAuthKeyInLocalStorage(
                        ApiManager.getAuthTokenString()
                    )
                }
                self.props.history.push('/')
            })
            .catch((error) => {
                if (
                    error.captainStatus ===
                    ErrorFactory.STATUS_ERROR_OTP_REQUIRED
                ) {
                    self.setState({
                        hasOtp: true,
                    })
                    Toaster.toastInfo('Enter OTP Verification Code')
                } else {
                    throw error
                }
            })
            .catch(Toaster.createCatcher())
    }

    render(): ReactComponentElement<any> {
        const self = this

        if (ApiManager.isLoggedIn()) return <Redirect to="/" />

        return (
            <div className='login-screen'>
                <div className='login-menu'>
                    <img src='/icon.png' alt='icon' />
                    <img src='/logo.png' alt='logo' style={{height:70, width:115, marginBottom: '1rem'}} />
                    <Card
                        style={{ width: '80%', marginBottom: '3rem' }}
                    >
                        <NormalLoginForm
                            onLoginRequested={(
                                password: string,
                                otp: string,
                                loginOption: number
                            ) => {
                                self.setState({ loginOption })
                                self.onLoginRequested(password, otp)
                            }}
                            hasOtp={self.state.hasOtp}
                        />
                    </Card>
                </div>
                <div className='login-background'>
                    <div className='column'>
                        <h1><strong>Build What's Next</strong></h1>
                        <p>Build and run <strong><em>epic</em></strong> AI/ML applications on neural's next-generation infrastructure and stack.</p>
                    </div>
                </div>
            </div>
        )
    }
}

const radioStyle = {
    display: 'block',
    height: '30px',
    lineHeight: '30px',
}

let lastSubmittedTime = 0

class NormalLoginForm extends React.Component<
    any,
    {
        //emailEntered: string
        loginOption: number
        passwordEntered: string
        otpEntered: string
    }
> {
    constructor(props: any) {
        super(props)
        this.state = {
            //emailEntered: ``,
            loginOption: NO_SESSION,
            passwordEntered: ``,
            otpEntered: ``,
        }
    }

    handleSubmit = (e?: React.FormEvent): void => {
        e?.preventDefault()
        const now = new Date().getTime()
        if (now - lastSubmittedTime < 300) return // avoid duplicate clicks
        lastSubmittedTime = now
        const self = this
        self.props.onLoginRequested(
            //self.state.emailEntered,
            self.state.passwordEntered,
            self.state.otpEntered,
            self.state.loginOption
        )
    }

    render() {
        const self = this
        return (
            <>
                <h2 style={{width:'100%', textAlign:'center', marginTop:'1rem'}}><b>ACCOUNT LOGIN</b></h2>

                <form onSubmit={this.handleSubmit}>
                    <p className='input-title'>Email <span style={{color:'red', marginBottom:'0'}}>*</span></p>
                    <Input
                        required
                        onKeyDown={(key) => {
                            if (
                                `${key.key}`.toLocaleLowerCase() === 'enter' ||
                                `${key.code}`.toLocaleLowerCase() === 'enter' ||
                                key.keyCode === 13
                            ) {
                                //self.handleSubmit()
                            }
                        }}
                        onChange={(e) => {
                            //self.setState({ emailEntered: `${e.target.value}` })
                        }}
                        autoFocus
                    />
                    <p className='input-title'>Password <span style={{color:'red', marginBottom:'0'}}>*</span></p>
                    <Input
                        required
                        onKeyDown={(key) => {
                            if (
                                `${key.key}`.toLocaleLowerCase() === 'enter' ||
                                `${key.code}`.toLocaleLowerCase() === 'enter' ||
                                key.keyCode === 13
                            ) {
                                self.handleSubmit()
                            }
                        }}
                        onChange={(e) => {
                            self.setState({ passwordEntered: `${e.target.value}` })
                        }}
                        autoFocus
                    />
                    {/*
                    self.props.hasOtp ? (
                        probably delete all this, just keeping for temp reference

                        <div style={{ marginTop: 20, marginBottom: 20 }}>
                            <Row justify="end">
                                <Input
                                    onKeyDown={(key) => {
                                        if (
                                            `${key.key}`.toLocaleLowerCase() ===
                                                'enter' ||
                                            `${key.code}`.toLocaleLowerCase() ===
                                                'enter' ||
                                            key.keyCode === 13
                                        ) {
                                            self.handleSubmit()
                                        }
                                    }}
                                    addonBefore="OTP Verification Code"
                                    placeholder="123456"
                                    value={self.state.otpEntered}
                                    onChange={(e) => {
                                        self.setState({
                                            otpEntered: `${e.target.value}`,
                                        })
                                    }}
                                    autoFocus
                                />
                            </Row>
                        </div>
                    ) : undefined
                    */
                    }

                    <div style={{ marginTop: 20, marginBottom: 20 }}>
                        <Row justify="end">
                            <Button
                                type="primary"
                                htmlType="submit"
                                className="login-form-button"
                                style={{width:'100%', fontSize:'1rem'}}
                            >
                                Log in
                            </Button>
                        </Row>
                        <Row justify="space-between" style={{marginTop:'1rem'}}>
                            <a href='/' style={{textDecoration:'underline'}} >Forgot Password</a>
                            <a href='/' style={{textDecoration:'underline'}} >Don't have an account? <b>Sign up</b></a>
                        </Row>
                        <Button
                            type="ghost"
                            onClick={() => {/*
                                self.setState({
                                    isForceChangingDomain: true,
                                })
                            */}}
                            style={{width:'100%', marginTop:'3rem', fontWeight:'700'}}
                        >
                            <img
                                alt="google"
                                src="/icons/google-icon.png"
                                style={{
                                    height: 28,
                                    marginRight: 20,
                                }}
                            />
                            Sign in with Google
                        </Button>
                        <Button
                            type="ghost"
                            onClick={() => {/*
                                self.setState({
                                    isForceChangingDomain: true,
                                })
                            */}}
                            style={{width:'100%', marginTop:'1rem', fontWeight:'700'}}
                        >
                            <img
                                alt="github"
                                src="/icons/github-icon.png"
                                style={{
                                    height: 28,
                                    marginRight: 20,
                                }}
                            />
                            Sign in with Github
                        </Button>
                    </div>
                </form>
            </>
        )
    }
}
