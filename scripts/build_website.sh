#!/bin/bash

scriptdir=$(dirname $(readlink -f "$0"))
echo $scriptdir
cd $scriptdir
cd ../

rm -r player.localbuild/
cp -R player/www/ player.localbuild/
cd player.localbuild/

echo "Scanning files for URLs ..."

find ./ -type f \( -name "*.htm" -o -name "*.css" -o -name "*.js" \) ! -name "index.htm" \
-exec sed -i 's/\/js\//..\//g' {} \; \
-exec sed -i 's/\/img\//..\//g' {} \; \
-exec sed -i 's/\/css\//..\//g' {} \; \
-exec sed -i 's/\/html\//..\//g' {} \; \
-exec sed -i 's/\/img_lossy\//..\//g' {} \; \
-exec echo {} \;

sed -i 's/\/js\///g' index.htm 
sed -i 's/\/img\///g' index.htm 
sed -i 's/\/css\///g' index.htm 
sed -i 's/\/html\///g' index.htm 
sed -i 's/\/img_lossy\///g' index.htm 

cd ../

echo "Successfully built local version of website in folder 'player.localbuild'."


