//! Hashes of the input bytes, at once or chunk by chunk for large files.

use crate::op::{
    Choice, Group, Op, OpError, OpMeta, OpResult, ParamKind, ParamSpec, Params,
};
use data_encoding::{BASE64, HEXLOWER, HEXUPPER};
use md5::Md5;
use sha1::Sha1;
use sha2::{Digest, Sha224, Sha256, Sha384, Sha512};

static FORMATS: &[Choice] = &[
    Choice {
        id: "hex",
        name: "hex",
    },
    Choice {
        id: "HEX",
        name: "HEX",
    },
    Choice {
        id: "base64",
        name: "base64",
    },
];

static PARAMS: &[ParamSpec] = &[ParamSpec {
    id: "format",
    name: "Output",
    kind: ParamKind::Choice {
        options: FORMATS,
        default: "hex",
    },
}];

/// Lists every hash once, for both the operations and `hasher`.
macro_rules! hashes {
    ($($id:literal, $name:literal, $bits:literal, $hash:ty;)*) => {
        pub static OPS: &[Op] = &[$(
            Op {
                meta: OpMeta {
                    id: $id,
                    name: $name,
                    group: Group::Hash,
                    params: PARAMS,
                    example: $bits,
                },
                run: digest::<$hash>,
            },
        )*];

        fn hasher(id: &str) -> Option<Box<dyn Hash>> {
            match id {
                $($id => Some(Box::new(<$hash>::new())),)*
                _ => None,
            }
        }
    };
}

hashes! {
    "hash.md5", "MD5", "128 bit", Md5;
    "hash.sha1", "SHA-1", "160 bit", Sha1;
    "hash.sha224", "SHA-224", "224 bit", Sha224;
    "hash.sha256", "SHA-256", "256 bit", Sha256;
    "hash.sha384", "SHA-384", "384 bit", Sha384;
    "hash.sha512", "SHA-512", "512 bit", Sha512;
}

trait Hash {
    fn update(&mut self, data: &[u8]);
    fn finish(self: Box<Self>) -> Vec<u8>;
}

impl<D: Digest> Hash for D {
    fn update(&mut self, data: &[u8]) {
        Digest::update(self, data);
    }

    fn finish(self: Box<Self>) -> Vec<u8> {
        self.finalize().to_vec()
    }
}

fn digest<D: Digest>(input: &[u8], params: &Params) -> OpResult {
    let format = params.choice("format");
    Ok(formatted(&D::digest(input), format).into_bytes())
}

fn formatted(hash: &[u8], format: &str) -> String {
    match format {
        "HEX" => HEXUPPER.encode(hash),
        "base64" => BASE64.encode(hash),
        _ => HEXLOWER.encode(hash),
    }
}

/// Several hashes of one stream of chunks, so a large file is read once
/// and never held in memory whole.
pub struct MultiHasher {
    hashes: Vec<Box<dyn Hash>>,
    format: &'static str,
}

impl MultiHasher {
    pub fn new(ids: &[&str], format: &str) -> Result<Self, OpError> {
        let hashes = ids
            .iter()
            .map(|id| {
                hasher(id).ok_or_else(|| {
                    OpError::new(format!("'{id}' is not a hash"))
                })
            })
            .collect::<Result<_, _>>()?;
        let format = FORMATS
            .iter()
            .find(|choice| choice.id == format)
            .ok_or_else(|| OpError::new(format!("Unknown format '{format}'")))?
            .id;
        Ok(Self { hashes, format })
    }

    pub fn update(&mut self, chunk: &[u8]) {
        for hash in &mut self.hashes {
            hash.update(chunk);
        }
    }

    pub fn finish(self) -> Vec<String> {
        self.hashes
            .into_iter()
            .map(|hash| formatted(&hash.finish(), self.format))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::run_with;
    use serde_json::json;

    const ABC_448: &str =
        "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq";
    const ABC_896: &str = concat!(
        "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmn",
        "hijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu",
    );

    fn hex(id: &str, input: &str) -> String {
        run_with(id, input, json!({}))
    }

    // RFC 1321, appendix A.5
    #[test]
    fn md5_matches_rfc_1321() {
        let vectors = [
            ("", "d41d8cd98f00b204e9800998ecf8427e"),
            ("a", "0cc175b9c0f1b6a831c399e269772661"),
            ("abc", "900150983cd24fb0d6963f7d28e17f72"),
            ("message digest", "f96b697d7cb7938d525a2f31aaf161d0"),
            (
                "abcdefghijklmnopqrstuvwxyz",
                "c3fcd3d76192e4007dfb496cca67e13b",
            ),
            (
                concat!(
                    "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                    "abcdefghijklmnopqrstuvwxyz0123456789",
                ),
                "d174ab98d277d9f5a5611c2c9f419d9f",
            ),
            (&"1234567890".repeat(8), "57edf4a22be3c955ac49da2e2107b67a"),
        ];
        for (input, expected) in vectors {
            assert_eq!(hex("hash.md5", input), expected, "{input}");
        }
    }

    // FIPS 180-4 examples (NIST CSRC "Examples with intermediate values")
    #[test]
    fn sha_family_matches_fips_180() {
        let vectors = [
            (
                "hash.sha1",
                "abc",
                "a9993e364706816aba3e25717850c26c9cd0d89d",
            ),
            (
                "hash.sha1",
                ABC_448,
                "84983e441c3bd26ebaae4aa1f95129e5e54670f1",
            ),
            (
                "hash.sha224",
                "abc",
                "23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7",
            ),
            (
                "hash.sha224",
                ABC_448,
                "75388b16512776cc5dba5da1fd890150b0c6455cb4f58b1952522525",
            ),
            (
                "hash.sha256",
                "abc",
                concat!(
                    "ba7816bf8f01cfea414140de5dae2223",
                    "b00361a396177a9cb410ff61f20015ad",
                ),
            ),
            (
                "hash.sha256",
                ABC_448,
                concat!(
                    "248d6a61d20638b8e5c026930c3e6039",
                    "a33ce45964ff2167f6ecedd419db06c1",
                ),
            ),
            (
                "hash.sha384",
                "abc",
                concat!(
                    "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded163",
                    "1a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
                ),
            ),
            (
                "hash.sha384",
                ABC_896,
                concat!(
                    "09330c33f71147e83d192fc782cd1b4753111b173b3b05d2",
                    "2fa08086e3b0f712fcc7c71a557e2db966c3e9fa91746039",
                ),
            ),
            (
                "hash.sha512",
                "abc",
                concat!(
                    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea2",
                    "0a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd",
                    "454d4423643ce80e2a9ac94fa54ca49f",
                ),
            ),
            (
                "hash.sha512",
                ABC_896,
                concat!(
                    "8e959b75dae313da8cf4f72814fc143f8f7779c6eb9f7fa1",
                    "7299aeadb6889018501d289e4900f7e4331b99dec4b5433a",
                    "c7d329eeb6dd26545e96e55b874be909",
                ),
            ),
        ];
        for (id, input, expected) in vectors {
            assert_eq!(hex(id, input), expected, "{id}({input})");
        }
    }

    #[test]
    fn a_million_a_hashes_like_fips_180() {
        let input = "a".repeat(1_000_000);
        let expected = concat!(
            "cdc76e5c9914fb9281a1c7e284d73e67",
            "f1809a48a497200e046d39ccc7112cd0",
        );
        assert_eq!(hex("hash.sha256", &input), expected);
    }

    #[test]
    fn output_formats() {
        let cases = [
            ("hex", "900150983cd24fb0d6963f7d28e17f72"),
            ("HEX", "900150983CD24FB0D6963F7D28E17F72"),
            ("base64", "kAFQmDzST7DWlj99KOF/cg=="),
        ];
        for (format, expected) in cases {
            let params = json!({ "format": format });
            assert_eq!(run_with("hash.md5", "abc", params), expected);
        }
    }

    #[test]
    fn chunked_hashing_matches_hashing_at_once() {
        let ids: Vec<&str> = OPS.iter().map(|op| op.meta.id).collect();
        let mut hasher = MultiHasher::new(&ids, "hex").unwrap();
        for chunk in ABC_896.as_bytes().chunks(7) {
            hasher.update(chunk);
        }

        let at_once: Vec<String> =
            ids.iter().map(|id| hex(id, ABC_896)).collect();
        assert_eq!(hasher.finish(), at_once);
    }

    #[test]
    fn multi_hasher_rejects_unknown_ids_and_formats() {
        let error = MultiHasher::new(&["case.lower"], "hex").err().unwrap();
        assert_eq!(error.message, "'case.lower' is not a hash");
        let error = MultiHasher::new(&["hash.md5"], "octal").err().unwrap();
        assert_eq!(error.message, "Unknown format 'octal'");
    }
}
