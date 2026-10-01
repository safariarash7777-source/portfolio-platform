"""Read-only remote probe. Run over the existing authorized SSH connection.
Print only a whitelisted status projection; never container env or credentials.
"""
import json
import subprocess
import hmac
def docker(*args):
    return subprocess.check_output(["docker",*args],text=True)
auth=json.loads(docker("inspect","portfolio-stage-auth-1"))[0]
env=dict(item.split("=",1) for item in auth["Config"]["Env"])
allowed=["GOTRUE_SITE_URL","API_EXTERNAL_URL","GOTRUE_URI_ALLOW_LIST","GOTRUE_EXTERNAL_PHONE_ENABLED","GOTRUE_EXTERNAL_EMAIL_ENABLED","GOTRUE_EXTERNAL_GOOGLE_ENABLED","GOTRUE_DISABLE_SIGNUP","GOTRUE_SMS_AUTOCONFIRM","GOTRUE_SMS_OTP_EXP","GOTRUE_SMS_MAX_FREQUENCY","GOTRUE_HOOK_SEND_SMS_ENABLED","GOTRUE_RATE_LIMIT_VERIFY","GOTRUE_RATE_LIMIT_SMS_SENT"]
allowed.append("GOTRUE_RATE_LIMIT_HEADER")
rest=json.loads(docker("inspect","portfolio-stage-rest-1"))[0]
rest_env=dict(item.split("=",1) for item in rest["Config"]["Env"])
auth_secret,rest_secret=env.get("GOTRUE_JWT_SECRET",""),rest_env.get("PGRST_JWT_SECRET","")
print(json.dumps({"image":auth["Config"]["Image"],"settings":{key:env.get(key,"UNSET; installed default applies") for key in allowed},"smtpConfigured":bool(env.get("GOTRUE_SMTP_HOST")),"smsHookSecretConfigured":bool(env.get("GOTRUE_HOOK_SEND_SMS_SECRETS")),"authRestSharedSigningSecretMatches":bool(auth_secret and rest_secret and hmac.compare_digest(auth_secret,rest_secret))},indent=2))
