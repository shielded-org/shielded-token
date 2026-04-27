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
    amount: Field,
    blinding: Field,
}

fn hash_note(note: Note) -> Field {
    poseidon2_hash4(note.owner, note.token, note.amount, note.blinding)
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
    in_amounts: [Field; 2],
    in_blindings: [Field; 2],
    merkle_siblings: [[Field; 20]; 2],
    merkle_directions: [[bool; 20]; 2],
    out_amounts: [Field; 2],
    out_recipient_pks: [Field; 2],
    out_blindings: [Field; 2],
    token: pub Field,
    merkle_root: pub Field,
    nullifiers: pub [Field; 2],
    out_commitments: pub [Field; 2],
    fee: pub Field,
    fee_recipient_pk: pub Field,
    mode: pub Field,
    unshield_recipient: pub Field,
    unshield_amount: pub Field,
    unshield_token_address: pub Field,
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
        // mode=0(transfer): validate both inputs.
        // mode=1(unshield): validate only input 0.
        let should_validate_input = if i == 0 { 1 } else { 1 - mode };
        assert((if verify_merkle_path(input_commitment, merkle_siblings[i], merkle_directions[i], merkle_root) { 1 } else { 0 } - 1) * should_validate_input == 0);

        let expected_nf = hash_nullifier(spending_key, input_commitment);
        assert((expected_nf - nullifiers[i]) * should_validate_input == 0);

        let out_note = Note {
            owner: out_recipient_pks[i],
            token,
            amount: out_amounts[i],
            blinding: out_blindings[i],
        };
        let expected_out = hash_note(out_note);
        assert((out_commitments[i] - expected_out) * (1 - mode) == 0);
    }

    // mode must be binary: {0,1}
    assert(mode * (mode - 1) == 0);

    // mode=0 transfer: value is conserved into output notes.
    assert((in_amounts[0] + in_amounts[1] - (out_amounts[0] + out_amounts[1])) * (1 - mode) == 0);

    // mode=0 transfer: if fee > 0, output #1 owner must be fee recipient and output #1 amount must equal fee.
    assert((out_recipient_pks[1] - fee_recipient_pk) * fee * (1 - mode) == 0);
    assert((out_amounts[1] - fee) * fee * (1 - mode) == 0);

    // mode=1 unshield: second input/output lane and fee lane are zeroed.
    assert(in_amounts[1] * mode == 0);
    assert(in_blindings[1] * mode == 0);
    assert(nullifiers[1] * mode == 0);
    assert(out_amounts[0] * mode == 0);
    assert(out_amounts[1] * mode == 0);
    assert(out_recipient_pks[0] * mode == 0);
    assert(out_recipient_pks[1] * mode == 0);
    assert(out_blindings[0] * mode == 0);
    assert(out_blindings[1] * mode == 0);
    assert(out_commitments[0] * mode == 0);
    assert(out_commitments[1] * mode == 0);
    assert(fee * mode == 0);
    assert(fee_recipient_pk * mode == 0);

    // mode=1 unshield: exact-note withdrawal from input #0.
    assert((in_amounts[0] - unshield_amount) * mode == 0);
    assert((token - unshield_token_address) * mode == 0);
    assert(unshield_recipient * mode + (1 - mode) != 0);
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
