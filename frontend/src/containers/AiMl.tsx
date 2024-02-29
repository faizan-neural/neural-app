import { Button, Card, Col, Input, Modal, Row, Tooltip } from 'antd'
import { 
    ExportOutlined,
} from '@ant-design/icons'
import { Redirect, RouteComponentProps } from 'react-router'
import AppConstants from '../utils/AppConstants'
import Toaster from '../utils/Toaster'
import ApiComponent from './global/ApiComponent'
import CenteredSpinner from './global/CenteredSpinner'
import ErrorRetry from './global/ErrorRetry'
import NewTabLink from './global/NewTabLink'
const Search = Input.Search

export default class AiMl extends ApiComponent<
    RouteComponentProps<any>,
    {
        isLoading: boolean
        isForceChangingDomain: boolean
        apiData: any
        userEmail: string
    }
> {
    constructor(props: any) {
        super(props)
        this.state = {
            userEmail: '',
            isLoading: true,
            isForceChangingDomain: false,
            apiData: undefined,
        }
    }

    componentDidMount() {
        this.reFetchData()
    }

    reFetchData() {
        const self = this
        self.setState({ isLoading: true, apiData: undefined })
        return this.apiManager
            .getCaptainInfo()
            .then(function (data: any) {
                self.setState({ apiData: data })
            })
            .catch(Toaster.createCatcher())
            .then(function () {
                self.setState({ isLoading: false })
            })
    }

    onForceSslClicked() {
        
    }

    onEnableSslClicked() {
        const self = this
        const IGNORE = 'IGNORE'

        Promise.resolve()
            .then(function () {
                return new Promise(function (resolve, reject) {
                    Modal.success({
                        title: 'Enable HTTPS',
                        content: (
                            <div>
                                <p>
                                    CapRover uses{' '}
                                    <NewTabLink url="https://letsencrypt.org/">
                                        Let&#39;s Encrypt
                                    </NewTabLink>{' '}
                                    to provide free SSL Certificates (HTTPS).
                                    This email address is very important as
                                    Let&#39;s Encrypt uses it for validation
                                    purposes. Please provide a valid email here.
                                </p>
                                <p>
                                    IMPORTANT: Once you enable HTTPS, you cannot
                                    edit the root domain ever again. Make sure
                                    you use a good root domain. A good practice
                                    is to go one level deeper and setup your
                                    root domain. For example, if you own{' '}
                                    <code>example.com</code>, use{' '}
                                    <code>*.caprover-root.example.com</code> as
                                    your root domain. This will allow you to
                                    better manage your subdomains, do not use{' '}
                                    <code>*.example.com</code> as your root
                                    domain.
                                </p>
                                <Input
                                    placeholder="your@email.com"
                                    type="email"
                                    onChange={(event) =>
                                        self.setState({
                                            userEmail: (
                                                event.target.value || ''
                                            ).trim(),
                                        })
                                    }
                                />
                            </div>
                        ),
                        onOk() {
                            resolve(self.state.userEmail || '')
                        },
                        onCancel() {
                            resolve(undefined)
                        },
                    })
                })
            })
            .then(function (data: any) {
                if (data === undefined) return IGNORE
                self.setState({ isLoading: true })
                return self.apiManager.enableRootSsl(data)
            })

            .then(function (data: any) {
                if (data === IGNORE) return

                Modal.success({
                    title: 'Root Domain HTTPS activated!',
                    content: (
                        <div>
                            <p>
                                You can now use{' '}
                                <code>
                                    {`https://${self.state.apiData.rootDomain}`}
                                </code>
                                . Next step is to Force HTTPS to disallow plain
                                HTTP traffic.
                            </p>
                        </div>
                    ),
                })

                return self.reFetchData()
            })
            .catch(Toaster.createCatcher())
            .then(function () {
                self.setState({ isLoading: false })
            })
    }

    updateRootDomainClicked(rootDomain: string) {
        const self = this
        if (!self.state.apiData.hasRootSsl) {
            self.performUpdateRootDomain(rootDomain, false)
            return
        }

        Modal.confirm({
            title: 'Force Change Root Domain',
            content: (
                <div>
                    <p>
                        You have already enabled SSL for your root domain.
                        Changing the root domain URL will invalidate HTTPS on
                        root domain and all default subdomains for apps if you
                        have any apps.
                    </p>
                    <p>
                        You can still re-enable HTTPS after changing the root
                        domain.
                    </p>
                </div>
            ),
            onOk() {
                self.performUpdateRootDomain(rootDomain, true)
            },
            onCancel() {
                // do nothing
            },
        })
    }

    performUpdateRootDomain(rootDomain: string, force: boolean) {
        const self = this

        this.apiManager
            .updateRootDomain(rootDomain, force)
            .then(function (data: any) {
                Modal.success({
                    title: 'Root Domain Updated',
                    content: (
                        <div>
                            <p>
                                Click Ok to get redirected to your new root
                                domain. You need to log in again.
                            </p>
                        </div>
                    ),
                    onOk() {
                        window.location.replace(
                            `http://${self.state.apiData.captainSubDomain}.${rootDomain}`
                        )
                    },
                })
            })
            .catch(Toaster.createCatcher())
    }

    render() {
        const self = this

        if (self.state.isLoading) {
            return <CenteredSpinner />
        }

        if (!self.state.apiData) {
            return <ErrorRetry />
        }

        const qs = new URLSearchParams(self.props.location.search)

        if (
            !!this.state.apiData.forceSsl &&
            !!qs.get(AppConstants.REDIRECT_TO_APPS_IF_READY_REQ_PARAM)
        ) {
            return <Redirect to="/apps" />
        }

        return (
            <div>
                <h1 style={{margin:'2rem 2.5rem'}}>AI/ML</h1>
                {/*
                <br />
                {self.createPostFullSetupIfHasForceSsl()}
                <br />
                {self.createSetupPanelIfNoForceSsl()}
                */}
            </div>
        )
    }

    
}
