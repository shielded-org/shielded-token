use dep::poseidon::poseidon2::Poseidon2;

fn poseidon2_hash2(a: Field, b: Field) -> Field {
    Poseidon2::hash([a, b], 2)
}

fn poseidon2_hash4(a: Field, b: Field, c: Field, d: Field) -> Field {
    Poseidon2::hash([a, b, c, d], 4)
}

struct Note {
    owner: Field,
    token: Field,
    amount: u64,
    blinding: Field,
}

fn hash_note(note: Note) -> Field {
    poseidon2_hash4(note.owner, note.token, note.amount as Field, note.blinding)
}

fn hash_nullifier(spending_key: Field, commitment: Field) -> Field {
    poseidon2_hash2(spending_key, commitment)
}

fn merkle_parent(left: Field, right: Field) -> Field {
    poseidon2_hash2(left, right)
}

fn verify_merkle_path(leaf: Field, siblings: [Field; 20], directions: [bool; 20], root: Field) -> bool {
    let mut acc = leaf;
    for i in 0..20 {
        if directions[i] {
            acc = merkle_parent(siblings[i], acc);
        } else {
            acc = merkle_parent(acc, siblings[i]);
        }
    }
    acc == root
}

fn main(
    spending_key: Field,
    in_amounts: [u64; 2],
    in_blindings: [Field; 2],
    merkle_siblings: [[Field; 20]; 2],
    merkle_directions: [[bool; 20]; 2],
    out_amounts: [u64; 2],
    out_recipient_pks: [Field; 2],
    out_blindings: [Field; 2],
    token: pub Field,
    merkle_root: pub Field,
    nullifiers: pub [Field; 2],
    out_commitments: pub [Field; 2],
    fee: pub u64,
) {
    // Ownership is tied to a public key hash derived from spending key.
    let owner_pk = poseidon2_hash2(spending_key, 1);

    for i in 0..2 {
        let in_note = Note {
            owner: owner_pk,
            token,
            amount: in_amounts[i],
            blinding: in_blindings[i],
        };
        let input_commitment = hash_note(in_note);
        assert(verify_merkle_path(input_commitment, merkle_siblings[i], merkle_directions[i], merkle_root));

        let expected_nf = hash_nullifier(spending_key, input_commitment);
        assert(expected_nf == nullifiers[i]);

        let out_note = Note {
            owner: out_recipient_pks[i],
            token,
            amount: out_amounts[i],
            blinding: out_blindings[i],
        };
        assert(out_commitments[i] == hash_note(out_note));
    }

    // Prevent same note being spent twice in same proof.
    assert(nullifiers[0] != nullifiers[1]);
    assert(in_amounts[0] + in_amounts[1] == out_amounts[0] + out_amounts[1] + fee);
}

#[test]
fn test_hash_nullifier_changes_with_input() {
    let note = Note {
        owner: 10,
        token: 20,
        amount: 50,
        blinding: 4,
    };

    let c = hash_note(note);
    let nf_a = hash_nullifier(9, c);
    let nf_b = hash_nullifier(10, c);
    assert(nf_a != nf_b);
}
