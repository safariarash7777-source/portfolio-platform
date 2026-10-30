// Compatibility entry; shared gateway owns the fixed routes and host lifecycle.
import {startNativeAuthGateway} from './native-auth-gateway.mjs';
await startNativeAuthGateway('pf10');
