using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Security.Cryptography;

// File framing only; encryption/authentication are the .NET AES/HMAC primitives.
public static class CheckpointCrypto {
    public const int BufferSize = 65536;
    private static readonly byte[] Magic = Encoding.ASCII.GetBytes("CFBK0001");
    public static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    public static string FileHash(string path) { using var f=File.OpenRead(path); return Convert.ToHexString(SHA256.HashData(f)).ToLowerInvariant(); }
    public static byte[] Mac(byte[] bytes, byte[] key) { using var h=new HMACSHA256(key); return h.ComputeHash(bytes); }
    public static bool Equal(byte[] a, byte[] b) => CryptographicOperations.FixedTimeEquals(a,b);
    private static void Exactly(Stream s, byte[] b) { int n=0,r; while(n<b.Length && (r=s.Read(b,n,b.Length-n))>0)n+=r; if(n!=b.Length)throw new InvalidDataException(); }
    private static byte[] Slice(byte[] master,int start) { if(master.Length!=64)throw new InvalidDataException(); var k=new byte[32]; Buffer.BlockCopy(master,start,k,0,32); return k; }
    private sealed class MacWriter : Stream {
        readonly Stream output; readonly HMACSHA256 mac;
        public MacWriter(Stream output,HMACSHA256 mac){this.output=output;this.mac=mac;}
        public override void Write(byte[] b,int o,int n){mac.TransformBlock(b,o,n,null,0);output.Write(b,o,n);}
        public override void Flush()=>output.Flush(); public override bool CanRead=>false;public override bool CanWrite=>true;public override bool CanSeek=>false;
        public override long Length=>throw new NotSupportedException(); public override long Position{get=>throw new NotSupportedException();set=>throw new NotSupportedException();}
        public override int Read(byte[] b,int o,int n)=>throw new NotSupportedException();public override long Seek(long o,SeekOrigin so)=>throw new NotSupportedException();public override void SetLength(long n)=>throw new NotSupportedException();
    }
    private sealed class LimitedReader : Stream {
        readonly Stream input; long remaining;
        public LimitedReader(Stream input,long length){this.input=input;remaining=length;}
        public override int Read(byte[] b,int o,int n){if(remaining==0)return 0;int r=input.Read(b,o,(int)Math.Min(n,remaining));if(r==0)throw new EndOfStreamException();remaining-=r;return r;}
        public override bool CanRead=>true;public override bool CanWrite=>false;public override bool CanSeek=>false;
        public override long Length=>throw new NotSupportedException();public override long Position{get=>throw new NotSupportedException();set=>throw new NotSupportedException();}
        public override void Flush(){}public override void Write(byte[] b,int o,int n)=>throw new NotSupportedException();public override long Seek(long o,SeekOrigin so)=>throw new NotSupportedException();public override void SetLength(long n)=>throw new NotSupportedException();
    }
    public static void Encrypt(Stream input,string path,string header,long expectedLength,string expectedHash,byte[] master) {
        var encKey=Slice(master,0);var macKey=Slice(master,32);var buffer=new byte[BufferSize];
        try {
            var headerBytes=Encoding.UTF8.GetBytes(header);if(headerBytes.Length>16384 || expectedLength<0)throw new InvalidDataException();
            using var output=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None);
            using var mac=new HMACSHA256(macKey);using var writer=new MacWriter(output,mac);using var aes=Aes.Create();
            aes.KeySize=256;aes.Mode=CipherMode.CBC;aes.Padding=PaddingMode.PKCS7;aes.Key=encKey;aes.GenerateIV();
            // Magic + little-endian UInt32 header size + exact UTF8 header + random IV.
            writer.Write(Magic,0,Magic.Length);var size=BitConverter.GetBytes(headerBytes.Length);if(!BitConverter.IsLittleEndian)Array.Reverse(size);
            writer.Write(size,0,4);writer.Write(headerBytes,0,headerBytes.Length);writer.Write(aes.IV,0,16);
            using var sha=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);long count=0;
            using(var cipher=new CryptoStream(writer,aes.CreateEncryptor(),CryptoStreamMode.Write,true)) {
                int n;while((n=input.Read(buffer,0,buffer.Length))>0){count=checked(count+n);if(count>expectedLength)throw new InvalidDataException();sha.AppendData(buffer,0,n);cipher.Write(buffer,0,n);}
                var actual=Convert.ToHexString(sha.GetHashAndReset()).ToLowerInvariant();
                if(count!=expectedLength || actual!=expectedHash)throw new InvalidDataException();
                cipher.FlushFinalBlock();
            }
            mac.TransformFinalBlock(Array.Empty<byte>(),0,0);output.Write(mac.Hash,0,32);output.Flush(true);
        } finally {CryptographicOperations.ZeroMemory(encKey);CryptographicOperations.ZeroMemory(macKey);CryptographicOperations.ZeroMemory(buffer);}
    }
    public static void Verify(string path,string expectedHeader,long expectedLength,string expectedHash,byte[] master) {
        var encKey=Slice(master,0);var macKey=Slice(master,32);var buffer=new byte[BufferSize];
        try {
            // One exclusive file handle across authentication and decryption prevents a swap between passes.
            using var input=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.None);
            if(input.Length<8+4+16+16+32)throw new InvalidDataException();
            long authenticatedLength=input.Length-32;
            using(var mac=new HMACSHA256(macKey)) {
                long left=authenticatedLength;while(left>0){int n=input.Read(buffer,0,(int)Math.Min(left,buffer.Length));if(n==0)throw new EndOfStreamException();mac.TransformBlock(buffer,0,n,null,0);left-=n;}
                mac.TransformFinalBlock(Array.Empty<byte>(),0,0);var tag=new byte[32];Exactly(input,tag);
                if(!Equal(mac.Hash,tag))throw new CryptographicException();
            }
            // No plaintext processing occurs above this point.
            input.Position=0;var magic=new byte[8];Exactly(input,magic);if(!Equal(magic,Magic))throw new InvalidDataException();
            var sizeBytes=new byte[4];Exactly(input,sizeBytes);if(!BitConverter.IsLittleEndian)Array.Reverse(sizeBytes);int size=BitConverter.ToInt32(sizeBytes,0);
            if(size<1 || size>16384)throw new InvalidDataException();var header=new byte[size];Exactly(input,header);
            if(!Equal(header,Encoding.UTF8.GetBytes(expectedHeader)))throw new InvalidDataException();
            var iv=new byte[16];Exactly(input,iv);long cipherLength=authenticatedLength-input.Position;
            if(expectedLength<0 || cipherLength!=checked((expectedLength/16+1)*16))throw new InvalidDataException();
            using var aes=Aes.Create();aes.KeySize=256;aes.Mode=CipherMode.CBC;aes.Padding=PaddingMode.PKCS7;aes.Key=encKey;aes.IV=iv;
            using var limited=new LimitedReader(input,cipherLength);using var clear=new CryptoStream(limited,aes.CreateDecryptor(),CryptoStreamMode.Read);
            using var sha=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);long count=0;int read;
            while((read=clear.Read(buffer,0,buffer.Length))>0){count=checked(count+read);if(count>expectedLength)throw new InvalidDataException();sha.AppendData(buffer,0,read);}
            if(count!=expectedLength || Convert.ToHexString(sha.GetHashAndReset()).ToLowerInvariant()!=expectedHash)throw new InvalidDataException();
        } finally {CryptographicOperations.ZeroMemory(encKey);CryptographicOperations.ZeroMemory(macKey);CryptographicOperations.ZeroMemory(buffer);}
    }
}

// Binary stdout never goes through PowerShell's text pipeline. Stderr is drained and discarded.
public sealed class CheckpointSsh : IDisposable {
    readonly Process process;readonly Timer deadline;bool timedOut;
    public Stream Output=>process.StandardOutput.BaseStream;
    public CheckpointSsh(string program,string script,int seconds) {
        var psi=new ProcessStartInfo("ssh.exe"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
        foreach(var arg in new[]{"-T","-o","BatchMode=yes","-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=15","-o","ConnectionAttempts=1","-o","ServerAliveInterval=15","-o","ServerAliveCountMax=2","-i","C:/Users/Asus/.ssh/codex-liara-portfolio","root@62.60.191.24",program})psi.ArgumentList.Add(arg);
        process=new Process{StartInfo=psi};process.ErrorDataReceived+=(s,e)=>{};
        if(!process.Start())throw new IOException();process.BeginErrorReadLine();
        deadline=new Timer(_=>{timedOut=true;try{process.Kill(true);}catch{}},null,TimeSpan.FromSeconds(seconds),Timeout.InfiniteTimeSpan);
        try{process.StandardInput.Write(script);process.StandardInput.Close();}
        catch{deadline.Dispose();try{process.Kill(true);}catch{}process.Dispose();throw;}
    }
    public byte[] ReadMetadata(){using var output=new MemoryStream();var b=new byte[4096];int n;while((n=Output.Read(b,0,b.Length))>0){if(output.Length+n>65536)throw new InvalidDataException();output.Write(b,0,n);}Complete();return output.ToArray();}
    public void Complete(){if(!process.WaitForExit(10000)){try{process.Kill(true);}catch{}throw new IOException();}if(timedOut || process.ExitCode!=0)throw new IOException();deadline.Change(Timeout.Infinite,Timeout.Infinite);}
    public void Dispose(){deadline.Dispose();try{if(!process.HasExited)process.Kill(true);}catch{}process.Dispose();}
}
