#!/usr/bin/env python3
"""Offline schedule streaming protocol smoke tests, no Google access needed."""
import importlib.util
import os

ROOT=os.path.dirname(os.path.abspath(__file__))
spec=importlib.util.spec_from_file_location("youtube_schedule_worker",os.path.join(ROOT,"video_producer_youtube_schedule_worker.py"))
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

assert worker.CHUNK_SIZE==8*1024*1024
assert worker.parse_resumable_ack("bytes=0-8388607",0)==8388608
assert worker.parse_resumable_ack(None,0)==0
for source,offset in [("bytes=0-1048575",8388608),("bytes=0-16777215",0),("junk",1024)]:
    try:
        worker.parse_resumable_ack(source,offset)
    except RuntimeError:
        pass
    else:
        raise AssertionError("Worker accepted a partial, out of order or corrupt resumable acknowledgement")

print("Video Producer YouTube resumable worker smoke passed")
