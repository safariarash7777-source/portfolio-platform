import os
import json
import hashlib
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(os.environ["FX_VM_CONFIG_DIR"]) / "vendor"))
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

root = Path(os.environ["FX_VM_CONFIG_DIR"]).resolve()
auth = json.loads((Path.home() / ".liara-auth.json").read_text(encoding="utf-8"))
token = auth["accounts"]["safariarash7777"]["api_token"]
proxy = urllib.request.ProxyHandler({"https": "http://127.0.0.1:2080"})
opener = urllib.request.build_opener(proxy)


def get_json(path):
    req = urllib.request.Request(
        "https://iaas-api.liara.ir/" + path,
        headers={"Authorization": "Bearer " + token},
    )
    with opener.open(req, timeout=45) as response:
        return json.load(response)


vms = get_json("vm?teamID=")["vms"]
vm_id = next(vm["_id"] for vm in vms if vm["name"] == "arsadata-backend")
vm = get_json("vm/" + vm_id + "?teamID=")
client = paramiko.SSHClient()
client.load_host_keys(str(root / "vm_known_hosts"))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
client.connect(
    vm["IPs"][0]["address"],
    username="root",
    password=vm["config"]["rootPassword"],
    timeout=20,
)
client.get_transport().set_keepalive(15)
if sys.argv[1] == "--upload-verified":
    local, remote = Path(sys.argv[2]), sys.argv[3]
    expected = hashlib.sha256(local.read_bytes()).hexdigest()
    with client.open_sftp() as sftp:
        pending = remote + ".pending"
        sftp.put(str(local), pending)
        sftp.posix_rename(pending, remote)
        with sftp.open(remote, 'rb') as uploaded:
            actual = hashlib.sha256(uploaded.read()).hexdigest()
    if actual != expected:
        raise RuntimeError('Remote publication checksum mismatch')
    print(json.dumps({'status':'verified','sha256':actual}))
    code=0
elif sys.argv[1] == "--download":
    with client.open_sftp() as sftp:
        sftp.get(sys.argv[2],sys.argv[3])
    print("DOWNLOAD_OK")
    code=0
elif sys.argv[1] == "--upload-atomic":
    with client.open_sftp() as sftp:
        pending=sys.argv[3]+".pending"
        sftp.put(sys.argv[2],pending)
        sftp.posix_rename(pending,sys.argv[3])
    print("UPLOAD_OK")
    code=0
elif sys.argv[1] == "--upload":
    with client.open_sftp() as sftp:
        sftp.put(sys.argv[2], sys.argv[3])
    print("UPLOAD_OK")
    code = 0
elif sys.argv[1] == "--smoke-auth":
    with client.open_sftp() as sftp:
        sftp.put(str(Path(__file__).with_name("fx_smoke_test.py")), "/tmp/fx_smoke_test.py")
    _, stdout, stderr = client.exec_command(
        "docker cp /tmp/fx_smoke_test.py fx-dashboard:/app/fx_smoke_test.py "
        "&& docker exec -i -w /app fx-dashboard python fx_smoke_test.py --auth",
        timeout=240,
    )
    password = json.loads((root / "access_private.json").read_text(encoding="utf-8"))["password"]
    stdout.channel.sendall(password + "\n")
    stdout.channel.shutdown_write()
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    print(out[-10000:])
    if err:
        print(err[-10000:], file=sys.stderr)
    code = stdout.channel.recv_exit_status()
else:
    command = " ".join(sys.argv[1:])
    _, stdout, stderr = client.exec_command(command, timeout=3600)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    print(out[-10000:])
    if err:
        print(err[-10000:], file=sys.stderr)
    code = stdout.channel.recv_exit_status()
client.close()
sys.exit(code)
