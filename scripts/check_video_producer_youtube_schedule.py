#!/usr/bin/env python3
"""Network-free safety checks for the human-triggered YouTube Actions worker."""
import importlib.util
import pathlib

HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location("youtube_worker",HERE/"video_producer_youtube_schedule_worker.py")
assert spec and spec.loader
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

def rejects(function, message):
    try:
        function()
    except RuntimeError as error:
        assert message in str(error), str(error)
    else:
        raise AssertionError("The worker accepted an unsafe response")

def main():
    chunk=worker.CHUNK_SIZE
    assert chunk == 8*1024*1024
    assert worker.parse_resumable_ack("",0)==0
    assert worker.parse_resumable_ack("bytes=0-8388607",0)==chunk
    assert worker.parse_resumable_ack("bytes=0-16777215",chunk)==chunk*2
    rejects(lambda:worker.parse_resumable_ack("",chunk),"acknowledge")
    rejects(lambda:worker.parse_resumable_ack("bytes=0-1",chunk),"unexpected")
    rejects(lambda:worker.parse_resumable_ack(f"bytes=0-{chunk*2}",0),"unexpected")
    rejects(lambda:worker.parse_resumable_ack("bytes=30-40",0),"unexpected")
    print("YouTube resumable upload safety checks passed")

if __name__=="__main__":
    main()
