//! Bounded transport for one logical evaluation across multiple ABI buffers.
use std::cell::RefCell;
pub(super) const MAX_BYTES: usize = 1_048_576;
thread_local! {
    static STATE: RefCell<State> = const { RefCell::new(State::Input(Vec::new())) };
}
enum State {
    Input(Vec<u8>),
    Output(Vec<u8>, usize),
    Closed,
}

#[no_mangle]
pub extern "C" fn history_append(handle: u32, size: u32) -> u32 {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let (State::Input(input), Some(block)) = (&mut *state, super::abi::read(handle, size)) else {
            return 0;
        };
        if block.len() > MAX_BYTES - input.len() {
            *state = State::Closed;
            return 0;
        }
        input.extend_from_slice(&block);
        1
    })
}

#[no_mangle]
pub extern "C" fn history_finish() -> u32 {
    finish(|input| super::evaluate_fold(input, MAX_BYTES, None))
}

pub(super) fn finish(evaluate:impl FnOnce(&[u8])->Vec<u8>) -> u32 {
    STATE.with(|state| {
        let State::Input(input) = state.replace(State::Closed) else { return 0; };
        let output = evaluate(&input);
        let len = output.len() as u32;
        state.replace(State::Output(output, 0));
        len
    })
}

#[no_mangle]
pub extern "C" fn history_next() -> u64 {
    STATE.with(|state| {
        let mut state = state.borrow_mut();
        let State::Output(bytes, offset) = &mut *state else { return 0; };
        let end = (*offset + super::RESPONSE_BYTES).min(bytes.len());
        if end == *offset { return 0; }
        let size = end - *offset;
        let handle = super::abi::insert(bytes[*offset..end].to_vec());
        if handle == 0 { return 0; }
        *offset = end;
        (u64::from(handle) << 32) | size as u64
    })
}
