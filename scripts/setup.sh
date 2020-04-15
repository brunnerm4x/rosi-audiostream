#!/bin/bash

scriptdir=$(dirname $(readlink -f "$0"))
echo $scriptdir
cd $scriptdir
cd ../

echo "Changed to working directory $PWD"

if [ ! -f db/streams.json ]; then
	echo "Creating new Database ... " 
	mkdir -p db/audio
	echo "[]" > db/streams.json 
fi

mkdir -p manager/tmp

echo "Finished Initial Setup."

